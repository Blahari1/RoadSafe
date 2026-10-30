// Controller-level tests using in-memory fake models (see helpers/fakes.js).
// They verify our logic and the atomic-update contract; they do NOT exercise
// a real MongoDB instance.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  loadWithFakes,
  mockReq,
  mockRes,
  makeMechanic,
  makeRequest,
  at,
} = require("./helpers/fakes");

const setup = (data) =>
  loadWithFakes("controllers/mechanicRequestController.js", data);

const list = async (controller, mechanic) => {
  const res = mockRes();
  await controller.getMechanicRequests(mockReq({ userId: mechanic.userId }), res);
  return res;
};

const accept = async (controller, mechanic, request, io) => {
  const res = mockRes();
  await controller.acceptServiceRequest(
    mockReq({ userId: mechanic.userId, params: { id: request._id }, io }),
    res,
  );
  return res;
};

test.afterEach(() => {
  delete process.env.MECHANIC_MAX_RADIUS_KM;
});

// ---------------------------------------------------------------- listing

test("list: only requests matching the mechanic's services are returned", async () => {
  const mechanic = makeMechanic({ services: ["Towing"] });
  const towing = makeRequest({ serviceType: "Towing" });
  const oil = makeRequest({ serviceType: "Oil Change" });
  const { controller } = setup({ mechanics: [mechanic], requests: [towing, oil] });

  const res = await list(controller, mechanic);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.availableRequests.map((r) => r._id), [towing._id]);
});

test("list: requests beyond the radius are filtered out; in-range ones carry a distance", async () => {
  const mechanic = makeMechanic();
  const near = makeRequest({ location: { address: "a", ...at(3) } });
  const edge = makeRequest({ location: { address: "b", ...at(24) } });
  const far = makeRequest({ location: { address: "c", ...at(40) } });
  const { controller } = setup({ mechanics: [mechanic], requests: [far, edge, near] });

  const res = await list(controller, mechanic);
  const ids = res.body.availableRequests.map((r) => r._id);

  assert.deepEqual(ids, [near._id, edge._id]); // nearest first, far excluded
  assert.ok(res.body.availableRequests[0].distanceKm < res.body.availableRequests[1].distanceKm);
  assert.equal(res.body.maxRadiusKm, 25);
});

test("list: radius is configurable via MECHANIC_MAX_RADIUS_KM", async () => {
  process.env.MECHANIC_MAX_RADIUS_KM = "5";
  const mechanic = makeMechanic();
  const within = makeRequest({ location: { address: "a", ...at(4) } });
  const beyond = makeRequest({ location: { address: "b", ...at(10) } });
  const { controller } = setup({ mechanics: [mechanic], requests: [within, beyond] });

  const res = await list(controller, mechanic);
  assert.deepEqual(res.body.availableRequests.map((r) => r._id), [within._id]);
  assert.equal(res.body.maxRadiusKm, 5);
});

test("list: request without coordinates is shown with distance null (not invented)", async () => {
  const mechanic = makeMechanic();
  const unpinned = makeRequest({ location: { address: "behind the market" } });
  const { controller } = setup({ mechanics: [mechanic], requests: [unpinned] });

  const res = await list(controller, mechanic);
  assert.equal(res.body.availableRequests.length, 1);
  assert.equal(res.body.availableRequests[0].distanceKm, null);
  assert.equal(res.body.availableRequests[0].distanceKnown, false);
});

test("list: mechanic without coordinates does not see pinned requests, and is told why", async () => {
  const mechanic = makeMechanic({ location: undefined });
  const pinned = makeRequest();
  const unpinned = makeRequest({ location: { address: "no pin" } });
  const { controller } = setup({ mechanics: [mechanic], requests: [pinned, unpinned] });

  const res = await list(controller, mechanic);
  assert.deepEqual(res.body.availableRequests.map((r) => r._id), [unpinned._id]);
  assert.equal(res.body.locationMissing, true);
  assert.equal(res.body.hiddenWithoutLocation, 1);
});

test("list: unavailable mechanic gets no available requests", async () => {
  const mechanic = makeMechanic({ isAvailable: false });
  const { controller } = setup({ mechanics: [mechanic], requests: [makeRequest()] });

  const res = await list(controller, mechanic);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.availableRequests, []);
  assert.equal(res.body.isAvailable, false);
});

test("list: pending and rejected mechanics are refused with their status", async () => {
  for (const status of ["pending", "rejected"]) {
    const mechanic = makeMechanic({ verificationStatus: status });
    const { controller } = setup({ mechanics: [mechanic], requests: [makeRequest()] });
    const res = await list(controller, mechanic);
    assert.equal(res.code, 403);
    assert.equal(res.body.verificationStatus, status);
  }
});

test("list: non-pending requests are never offered", async () => {
  const mechanic = makeMechanic();
  const taken = makeRequest({ status: "accepted", mechanicId: "someone" });
  const { controller } = setup({ mechanics: [mechanic], requests: [taken] });
  const res = await list(controller, mechanic);
  assert.deepEqual(res.body.availableRequests, []);
});

// ---------------------------------------------------------------- accepting

test("accept: an eligible mechanic accepts, status/assignee/timestamp are recorded", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const { controller, models, io, emitted } = setup({ mechanics: [mechanic], requests: [request] });

  const res = await accept(controller, mechanic, request, io);
  assert.equal(res.code, 200);

  const stored = models.ServiceRequest.docs[0];
  assert.equal(stored.status, "accepted");
  assert.equal(stored.mechanicId, mechanic.userId);
  assert.ok(stored.acceptedAt instanceof Date);
  assert.ok(emitted.some((e) => e.room === `user:${request.customerId}`));
});

test("accept: SIMULTANEOUS accepts by many mechanics -> exactly one wins, the rest get 409", async () => {
  const mechanics = Array.from({ length: 5 }, () => makeMechanic());
  const request = makeRequest();
  const { controller, models } = setup({ mechanics, requests: [request] });

  const results = await Promise.all(
    mechanics.map((m) => accept(controller, m, request)),
  );

  const winners = results.filter((r) => r.code === 200);
  const losers = results.filter((r) => r.code === 409);
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 4);

  const winnerIndex = results.findIndex((r) => r.code === 200);
  assert.equal(models.ServiceRequest.docs[0].mechanicId, mechanics[winnerIndex].userId);
});

test("accept: after one mechanic accepts, every later attempt is rejected", async () => {
  const [a, b, c] = [makeMechanic(), makeMechanic(), makeMechanic()];
  const request = makeRequest();
  const { controller, models } = setup({ mechanics: [a, b, c], requests: [request] });

  assert.equal((await accept(controller, a, request)).code, 200);
  assert.equal((await accept(controller, b, request)).code, 409);
  assert.equal((await accept(controller, c, request)).code, 409);
  assert.equal((await accept(controller, a, request)).code, 409); // not even twice
  assert.equal(models.ServiceRequest.docs[0].mechanicId, a.userId);
});

test("accept: out-of-range request is refused (403) and stays pending", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest({ location: { address: "far", ...at(60) } });
  const { controller, models } = setup({ mechanics: [mechanic], requests: [request] });

  const res = await accept(controller, mechanic, request);
  assert.equal(res.code, 403);
  assert.equal(res.body.reason, "out_of_range");
  assert.equal(models.ServiceRequest.docs[0].status, "pending");
  assert.equal(models.ServiceRequest.docs[0].mechanicId, null);
});

test("accept: a mechanic who cannot see a request cannot accept it (same rules)", async () => {
  const mechanic = makeMechanic();
  const farRequest = makeRequest({ location: { address: "far", ...at(60) } });
  const { controller } = setup({ mechanics: [mechanic], requests: [farRequest] });

  const listed = await list(controller, mechanic);
  assert.equal(listed.body.availableRequests.length, 0);
  assert.equal((await accept(controller, mechanic, farRequest)).code, 403);
});

test("accept: radius override applies to accepting as well as listing", async () => {
  process.env.MECHANIC_MAX_RADIUS_KM = "50";
  const mechanic = makeMechanic();
  const request = makeRequest({ location: { address: "x", ...at(40) } });
  const { controller } = setup({ mechanics: [mechanic], requests: [request] });

  assert.equal((await list(controller, mechanic)).body.availableRequests.length, 1);
  assert.equal((await accept(controller, mechanic, request)).code, 200);
});

test("accept: service type mismatch is refused", async () => {
  const mechanic = makeMechanic({ services: ["Oil Change"] });
  const request = makeRequest({ serviceType: "Towing" });
  const { controller, models } = setup({ mechanics: [mechanic], requests: [request] });

  const res = await accept(controller, mechanic, request);
  assert.equal(res.code, 409);
  assert.equal(models.ServiceRequest.docs[0].status, "pending");
});

test("accept: unavailable, pending and rejected mechanics are refused", async () => {
  const cases = [
    makeMechanic({ isAvailable: false }),
    makeMechanic({ verificationStatus: "pending" }),
    makeMechanic({ verificationStatus: "rejected" }),
  ];
  for (const mechanic of cases) {
    const request = makeRequest();
    const { controller, models } = setup({ mechanics: [mechanic], requests: [request] });
    const res = await accept(controller, mechanic, request);
    assert.equal(res.code, 403);
    assert.equal(models.ServiceRequest.docs[0].status, "pending");
  }
});

test("accept: missing coordinates are handled explicitly", async () => {
  // pinned request + mechanic without location -> refused with a clear reason
  const unlocated = makeMechanic({ location: undefined });
  const pinned = makeRequest();
  let ctx = setup({ mechanics: [unlocated], requests: [pinned] });
  let res = await accept(ctx.controller, unlocated, pinned);
  assert.equal(res.code, 403);
  assert.equal(res.body.reason, "mechanic_location_missing");

  // request without a pin -> distance cannot be checked, so it is acceptable
  const located = makeMechanic();
  const unpinned = makeRequest({ location: { address: "no pin" } });
  ctx = setup({ mechanics: [located], requests: [unpinned] });
  res = await accept(ctx.controller, located, unpinned);
  assert.equal(res.code, 200);
});

test("accept: invalid id and unknown request", async () => {
  const mechanic = makeMechanic();
  const { controller } = setup({ mechanics: [mechanic], requests: [] });
  const bad = mockRes();
  await controller.acceptServiceRequest(
    mockReq({ userId: mechanic.userId, params: { id: "not-an-id" } }),
    bad,
  );
  assert.equal(bad.code, 400);
  assert.equal((await accept(controller, mechanic, makeRequest())).code, 409);
});

// --------------------------------------------------- notifications + nearby

test("notifications go only to mechanics who are eligible under the same rules", async () => {
  const eligible = makeMechanic();
  const tooFar = makeMechanic({ location: at(80) });
  const noLocation = makeMechanic({ location: undefined });
  const wrongService = makeMechanic({ services: ["Oil Change"] });
  const unavailable = makeMechanic({ isAvailable: false });
  const request = makeRequest();

  const { controller, emitted, io } = loadWithFakes(
    "controllers/serviceRequestController.js",
    { mechanics: [eligible, tooFar, noLocation, wrongService, unavailable] },
  );

  await controller.notifyEligibleMechanics(mockReq({ io }), request);

  const rooms = emitted
    .filter((e) => e.event === "service_request_updated")
    .map((e) => e.room);
  assert.deepEqual(rooms, [`user:${eligible.userId}`]);
});

test("nearby search lists exactly the mechanics who could accept (consistency)", async () => {
  const mechanics = [
    makeMechanic(),
    makeMechanic({ location: at(10) }),
    makeMechanic({ location: at(80) }),
    makeMechanic({ location: undefined }),
    makeMechanic({ services: ["Oil Change"] }),
    makeMechanic({ isAvailable: false }),
    makeMechanic({ verificationStatus: "pending" }),
  ].map((m) => ({ ...m, userId: { _id: m.userId, name: "n", phone: "p" } }));

  const request = makeRequest({ serviceType: "Towing", location: { address: "x", ...at(0) } });
  const nearbyCtx = loadWithFakes("controllers/nearbyMechanicController.js", { mechanics });
  const res = mockRes();
  await nearbyCtx.controller.getNearbyMechanics(
    mockReq({
      userId: "c",
      query: { lat: String(at(0).latitude), lng: String(at(0).longitude), serviceType: "Towing" },
    }),
    res,
  );
  assert.equal(res.code, 200);
  const nearbyIds = res.body.mechanics.map((m) => m._id).sort();

  // Who can actually accept this same request? Ask the accept endpoint.
  const acceptIds = [];
  for (const m of mechanics) {
    const flat = { ...m, userId: m.userId._id };
    const ctx = setup({ mechanics: [flat], requests: [{ ...request }] });
    if ((await accept(ctx.controller, flat, request)).code === 200) acceptIds.push(m._id);
  }

  assert.deepEqual(nearbyIds, acceptIds.sort());
  assert.equal(nearbyIds.length, 2);
  assert.equal(res.body.maxRadiusKm, 25);
});

test("nearby search: radius is capped at the platform maximum and the cap is reported", async () => {
  const far = makeMechanic({ location: at(40) });
  const { controller } = loadWithFakes("controllers/nearbyMechanicController.js", {
    mechanics: [{ ...far, userId: { _id: far.userId, name: "n", phone: "p" } }],
  });
  const res = mockRes();
  await controller.getNearbyMechanics(
    mockReq({ userId: "c", query: { lat: "12.9716", lng: "77.5946", radiusKm: "100" } }),
    res,
  );
  assert.equal(res.body.radiusKm, 25);
  assert.equal(res.body.radiusCapped, true);
  assert.equal(res.body.count, 0); // 40 km is beyond the platform maximum
});
