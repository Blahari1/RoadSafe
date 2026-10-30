// MOCKED tests (in-memory fake models). They check that three things agree for
// requests whose stored coordinates are incomplete or invalid (legacy data):
//   1. evaluateEligibility / new-request notifications
//   2. the mechanic request LIST (including its MongoDB prefilter query shape)
//   3. the accept endpoint
// They do NOT run MongoDB; see the README for what that leaves unverified.
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
const { evaluateEligibility } = require("../utils/eligibility");
const { isValidLatitude, isValidLongitude } = require("../utils/geo");

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
};

// Stored shapes that evaluateEligibility treats as "unpinned".
const MALFORMED = {
  "valid latitude, longitude missing": { address: "a", latitude: 12.9716 },
  "valid longitude, latitude missing": { address: "a", longitude: 77.5946 },
  "latitude null, valid longitude": { address: "a", latitude: null, longitude: 77.5946 },
  "valid latitude, longitude null": { address: "a", latitude: 12.9716, longitude: null },
  "latitude out of range": { address: "a", latitude: 999, longitude: 77.5946 },
  "latitude below range": { address: "a", latitude: -91, longitude: 77.5946 },
  "longitude out of range": { address: "a", latitude: 12.9716, longitude: 181 },
  "latitude stored as string": { address: "a", latitude: "12.9716", longitude: 77.5946 },
  "longitude stored as string": { address: "a", latitude: 12.9716, longitude: "77.5946" },
  "latitude NaN": { address: "a", latitude: NaN, longitude: 77.5946 },
  "latitude Infinity": { address: "a", latitude: Infinity, longitude: 77.5946 },
  "longitude -Infinity": { address: "a", latitude: 12.9716, longitude: -Infinity },
  "both null": { address: "a", latitude: null, longitude: null },
  "address only": { address: "a" },
  "empty location": {},
};

const mechanicsFixture = () => ({
  near: makeMechanic(),
  far: makeMechanic({ location: at(90) }),
  unlocated: makeMechanic({ location: undefined }),
  wrongService: makeMechanic({ services: ["Oil Change"] }),
  unavailable: makeMechanic({ isAvailable: false }),
  pendingApproval: makeMechanic({ verificationStatus: "pending" }),
});

const listFor = async (controller, mechanic) => {
  const res = mockRes();
  await controller.getMechanicRequests(mockReq({ userId: mechanic.userId }), res);
  return res;
};

const notifiedMechanicIds = async (mechanics, request) => {
  const ctx = loadWithFakes("controllers/serviceRequestController.js", { mechanics });
  await ctx.controller.notifyEligibleMechanics(mockReq({ io: ctx.io }), request);
  const byRoom = new Map(mechanics.map((m) => [`user:${m.userId}`, m._id]));
  return ctx.emitted.map((e) => byRoom.get(e.room)).sort();
};

for (const [name, location] of Object.entries(MALFORMED)) {
  test(`legacy coordinates (${name}): notified mechanics == mechanics who see it listed, with distance unknown`, async () => {
    const m = mechanicsFixture();
    const mechanics = Object.values(m);
    const request = makeRequest({ location });

    // The rules call this request "unpinned" -> eligible for every approved,
    // available, service-matching mechanic, whatever their own location.
    for (const mech of [m.near, m.far, m.unlocated]) {
      const verdict = evaluateEligibility({ mechanic: mech, request });
      assert.equal(verdict.eligible, true, name);
      assert.equal(verdict.distanceKm, null);
    }

    const notified = await notifiedMechanicIds(mechanics, request);
    assert.deepEqual(notified, [m.near._id, m.far._id, m.unlocated._id].sort());

    const listCtx = loadWithFakes("controllers/mechanicRequestController.js", {
      mechanics,
      requests: [request],
    });

    const listed = [];
    for (const mech of mechanics) {
      const res = await listFor(listCtx.controller, mech);
      if (res.code === 200 && res.body.availableRequests.some((r) => r._id === request._id)) {
        listed.push(mech._id);
        const item = res.body.availableRequests.find((r) => r._id === request._id);
        assert.equal(item.distanceKm, null);
        assert.equal(item.distanceKnown, false);
      }
    }

    assert.deepEqual(listed.sort(), notified, `list vs notification mismatch for "${name}"`);
  });

  test(`legacy coordinates (${name}): a mechanic without a location is not told it is "hidden", and can accept it`, async () => {
    const mechanic = makeMechanic({ location: undefined });
    const request = makeRequest({ location });
    const ctx = loadWithFakes("controllers/mechanicRequestController.js", {
      mechanics: [mechanic],
      requests: [request],
    });

    const res = await listFor(ctx.controller, mechanic);
    assert.equal(res.body.availableRequests.length, 1);
    assert.equal(res.body.hiddenWithoutLocation, 0); // not counted as a hidden pinned request

    const acceptRes = mockRes();
    await ctx.controller.acceptServiceRequest(
      mockReq({ userId: mechanic.userId, params: { id: request._id } }),
      acceptRes,
    );
    assert.equal(acceptRes.code, 200);
  });
}

test("a VALID pin far from a mechanic is still excluded everywhere (the fix did not widen matching)", async () => {
  const m = mechanicsFixture();
  const mechanics = Object.values(m);
  const request = makeRequest({ location: { address: "far", ...at(90) } });

  assert.deepEqual(await notifiedMechanicIds(mechanics, request), [m.far._id]);

  const ctx = loadWithFakes("controllers/mechanicRequestController.js", { mechanics, requests: [request] });
  assert.equal((await listFor(ctx.controller, m.near)).body.availableRequests.length, 0);
  assert.equal((await listFor(ctx.controller, m.far)).body.availableRequests.length, 1);

  // The unlocated mechanic cannot be matched to a valid pin: hidden AND counted.
  const unlocated = await listFor(ctx.controller, m.unlocated);
  assert.equal(unlocated.body.availableRequests.length, 0);
  assert.equal(unlocated.body.hiddenWithoutLocation, 1);
});

test("consistency matrix: for every mechanic x request, notified <=> listed <=> evaluateEligibility", async () => {
  const m = mechanicsFixture();
  const mechanics = Object.values(m);
  const requests = [
    ...Object.values(MALFORMED).map((location) => makeRequest({ location })),
    makeRequest({ location: { address: "in range", ...at(5) } }),
    makeRequest({ location: { address: "out of range", ...at(60) } }),
    makeRequest({ location: { address: "edge", ...at(24) } }),
    makeRequest({ serviceType: "Oil Change", location: { address: "other service", ...at(2) } }),
  ];

  const listCtx = loadWithFakes("controllers/mechanicRequestController.js", { mechanics, requests });

  for (const mech of mechanics) {
    const res = await listFor(listCtx.controller, mech);
    const listedIds = new Set((res.body.availableRequests || []).map((r) => r._id));

    for (const request of requests) {
      const eligible = evaluateEligibility({ mechanic: mech, request }).eligible;
      assert.equal(
        listedIds.has(request._id),
        eligible,
        `list/eligibility disagree: location=${JSON.stringify(request.location)} service=${request.serviceType}`,
      );
    }
  }

  for (const request of requests) {
    const notified = await notifiedMechanicIds(mechanics, request);
    const listedFor = [];
    for (const mech of mechanics) {
      const res = await listFor(listCtx.controller, mech);
      if ((res.body.availableRequests || []).some((r) => r._id === request._id)) listedFor.push(mech._id);
    }
    assert.deepEqual(notified, listedFor.sort(), `notify/list disagree for ${JSON.stringify(request.location)}`);
  }
});

test("the database clause for 'valid pin' matches exactly what isValidLatitude/isValidLongitude accept", async () => {
  const { validPinnedClause } = require("../utils/geo");
  const { loadWithFakes: load } = require("./helpers/fakes");
  const samples = [
    ...Object.values(MALFORMED),
    { address: "a", latitude: 0, longitude: 0 },
    { address: "a", latitude: 90, longitude: 180 },
    { address: "a", latitude: -90, longitude: -180 },
    { address: "a", ...at(3) },
  ];
  const docs = samples.map((location, i) => ({ _id: String(i), location }));
  const { models } = load("controllers/mechanicRequestController.js", { requests: docs });
  const matched = new Set((await models.ServiceRequest.find(validPinnedClause())).map((d) => d._id));

  samples.forEach((location, i) => {
    const jsPinned = isValidLatitude(location.latitude) && isValidLongitude(location.longitude);
    assert.equal(matched.has(String(i)), jsPinned, JSON.stringify(location));
  });
});

// ------------------- new requests with half-specified coordinates are rejected

const createCtx = (mechanics = []) => {
  const customerId = "c".repeat(24);
  const vehicle = { _id: "a".repeat(24), userId: customerId };
  const ctx = loadWithFakes("controllers/serviceRequestController.js", { mechanics, vehicles: [vehicle] });
  return { ...ctx, customerId, vehicle };
};

const submit = async (ctx, location) => {
  const res = mockRes();
  await ctx.controller.createServiceRequest(
    mockReq({
      userId: ctx.customerId,
      io: ctx.io,
      body: {
        vehicleId: ctx.vehicle._id,
        serviceType: "Towing",
        problemDescription: "Engine stopped and will not restart",
        location,
      },
    }),
    res,
  );
  await flush();
  return res;
};

test("creation: half-specified or invalid coordinates are rejected (400), nothing stored, nobody notified", async () => {
  const rejected = [
    { address: "x", latitude: 12.9716 }, // latitude only
    { address: "x", longitude: 77.5946 }, // longitude only
    { address: "x", latitude: null, longitude: 77.5946 },
    { address: "x", latitude: 12.9716, longitude: null },
    { address: "x", latitude: null, longitude: null },
    { address: "x", latitude: 999, longitude: 77.5946 },
    { address: "x", latitude: 12.9716, longitude: 181 },
    { address: "x", latitude: "12.9716", longitude: 77.5946 },
    { address: "x", latitude: NaN, longitude: 77.5946 },
  ];

  for (const location of rejected) {
    const ctx = createCtx([makeMechanic()]);
    const res = await submit(ctx, location);
    assert.equal(res.code, 400, JSON.stringify(location));
    assert.equal(ctx.models.ServiceRequest.docs.length, 0, JSON.stringify(location));
    assert.equal(ctx.emitted.length, 0, JSON.stringify(location));
  }
});

test("creation: both coordinates valid, or neither, is accepted", async () => {
  for (const location of [{ address: "x", ...at(0) }, { address: "x" }]) {
    const ctx = createCtx([makeMechanic()]);
    assert.equal((await submit(ctx, location)).code, 201);
  }
});
