// MOCKED tests (in-memory fake models, see helpers/fakes.js).
// They verify controller logic, query shape and the atomic-claim contract.
// They are NOT MongoDB integration tests and NOT browser tests.
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
const { boundingBox, distanceKm } = require("../utils/geo");

const setup = (data) => loadWithFakes("controllers/mechanicRequestController.js", data);

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

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
};

test.afterEach(() => {
  delete process.env.MECHANIC_MAX_RADIUS_KM;
});

// =============================================== 1. the "newest 200" bug

test("REGRESSION: an older eligible request is not hidden behind 200+ newer out-of-range ones", async () => {
  const mechanic = makeMechanic();
  const oldEligible = makeRequest({
    location: { address: "close by", ...at(3) },
    createdAt: daysAgo(30),
  });
  // 250 NEWER pending requests, all far outside the 25 km radius.
  const newerFar = Array.from({ length: 250 }, (_, i) =>
    makeRequest({
      location: { address: "far", ...at(100 + i) },
      createdAt: daysAgo(1 - i / 1000),
    }),
  );

  const { controller } = setup({ mechanics: [mechanic], requests: [...newerFar, oldEligible] });
  const res = await list(controller, mechanic);

  assert.equal(res.code, 200);
  assert.deepEqual(res.body.availableRequests.map((r) => r._id), [oldEligible._id]);
  assert.equal(res.body.totalEligible, 1);
  assert.equal(res.body.truncated, false);
});

test("REGRESSION: older unpinned requests also survive many newer out-of-range ones", async () => {
  const mechanic = makeMechanic();
  const oldUnpinned = makeRequest({
    location: { address: "no pin" },
    createdAt: daysAgo(40),
  });
  const newerFar = Array.from({ length: 220 }, (_, i) =>
    makeRequest({ location: { address: "far", ...at(200 + i) }, createdAt: daysAgo(2 - i / 1000) }),
  );
  const { controller } = setup({ mechanics: [mechanic], requests: [...newerFar, oldUnpinned] });
  const res = await list(controller, mechanic);
  assert.deepEqual(res.body.availableRequests.map((r) => r._id), [oldUnpinned._id]);
});

test("list cap is applied AFTER filtering and distance sort, and is reported", async () => {
  const mechanic = makeMechanic();
  // 350 eligible requests. The OLDEST one is the NEAREST: it must be first.
  const requests = Array.from({ length: 350 }, (_, i) =>
    makeRequest({
      location: { address: `r${i}`, ...at(0.05 * (i + 1)) },
      createdAt: daysAgo(350 - i === 350 ? 400 : 300 - i), // i=0 is the oldest
    }),
  );
  const nearestOldest = requests[0];

  const { controller } = setup({ mechanics: [mechanic], requests });
  const res = await list(controller, mechanic);

  assert.equal(res.body.availableRequests.length, 100);
  assert.equal(res.body.totalEligible, 350);
  assert.equal(res.body.listLimit, 100);
  assert.equal(res.body.truncated, true);
  assert.equal(res.body.availableRequests[0]._id, nearestOldest._id);

  const distances = res.body.availableRequests.map((r) => r.distanceKm);
  assert.deepEqual([...distances].sort((a, b) => a - b), distances); // nearest first
});

test("requests across the antimeridian are found (bounding box wraps correctly)", async () => {
  const mechanic = makeMechanic({ location: { latitude: 0, longitude: 179.99 } });
  const across = makeRequest({ location: { address: "x", latitude: 0, longitude: -179.99 } }); // ~2.2 km
  const farAway = makeRequest({ location: { address: "y", latitude: 0, longitude: 100 } });
  const { controller } = setup({ mechanics: [mechanic], requests: [farAway, across] });
  const res = await list(controller, mechanic);
  assert.deepEqual(res.body.availableRequests.map((r) => r._id), [across._id]);
  assert.ok(res.body.availableRequests[0].distanceKm < 5);
});

test("bounding box is a superset of the radius circle (property test)", () => {
  // Deterministic pseudo-random generator so failures are reproducible.
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const centres = [
    [12.97, 77.59], [0, 0], [0, 179.9], [0, -179.9], [60, 10], [-45, 170], [85, 20], [89.95, 0],
  ];

  for (const [lat, lon] of centres) {
    for (const radius of [1, 25, 300]) {
      const box = boundingBox(lat, lon, radius);

      for (let i = 0; i < 400; i += 1) {
        // random point, then keep it only if truly within the radius
        const pLat = Math.max(-90, Math.min(90, lat + (rand() - 0.5) * (radius / 55)));
        let pLon = lon + (rand() - 0.5) * (radius / 55 / Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
        pLon = ((((pLon + 180) % 360) + 360) % 360) - 180;
        if (distanceKm(lat, lon, pLat, pLon) > radius) continue;

        const inLat = pLat >= box.minLat && pLat <= box.maxLat;
        const inLon =
          box.lonRanges === null || box.lonRanges.some(([a, b]) => pLon >= a && pLon <= b);
        assert.ok(inLat && inLon, `centre ${lat},${lon} r=${radius} point ${pLat},${pLon}`);
      }
    }
  }
});

test("a mechanic without a location sees only unpinned requests; pinned count covers ALL of them", async () => {
  const mechanic = makeMechanic({ location: undefined });
  const pinned = Array.from({ length: 230 }, () => makeRequest());
  const unpinned = makeRequest({ location: { address: "no pin" } });
  const { controller } = setup({ mechanics: [mechanic], requests: [...pinned, unpinned] });
  const res = await list(controller, mechanic);
  assert.deepEqual(res.body.availableRequests.map((r) => r._id), [unpinned._id]);
  assert.equal(res.body.hiddenWithoutLocation, 230);
  assert.equal(res.body.locationMissing, true);
});

// ============================================ 2. accept-time consistency

test("accept: availability switched off between check and claim -> claim is rolled back", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [mechanic], requests: [request] });
  // Right after the atomic claim succeeds, the mechanic goes unavailable.
  ctx.models.ServiceRequest.afterClaim = () => {
    ctx.models.Mechanic.docs[0].isAvailable = false;
  };

  const res = await accept(ctx.controller, mechanic, request, ctx.io);

  assert.equal(res.code, 409);
  assert.equal(res.body.reason, "eligibility_changed");
  const stored = ctx.models.ServiceRequest.docs[0];
  assert.equal(stored.status, "pending");
  assert.equal(stored.mechanicId, null);
  assert.equal(stored.acceptedAt, null);
  // The customer must never be told about an acceptance that was reverted.
  assert.equal(ctx.emitted.filter((e) => e.room === `user:${request.customerId}`).length, 0);
});

test("accept: mechanic location moved out of range between check and claim -> rolled back", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [mechanic], requests: [request] });
  ctx.models.ServiceRequest.afterClaim = () => {
    ctx.models.Mechanic.docs[0].location = at(300);
  };
  const res = await accept(ctx.controller, mechanic, request);
  assert.equal(res.code, 409);
  assert.equal(ctx.models.ServiceRequest.docs[0].status, "pending");
});

test("accept: approval revoked between check and claim -> rolled back", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [mechanic], requests: [request] });
  ctx.models.ServiceRequest.afterClaim = () => {
    ctx.models.Mechanic.docs[0].verificationStatus = "rejected";
  };
  assert.equal((await accept(ctx.controller, mechanic, request)).code, 409);
  assert.equal(ctx.models.ServiceRequest.docs[0].status, "pending");
});

test("accept: after a rolled-back claim, another eligible mechanic can accept", async () => {
  const flaky = makeMechanic();
  const steady = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [flaky, steady], requests: [request] });
  let first = true;
  ctx.models.ServiceRequest.afterClaim = () => {
    if (first) {
      first = false;
      ctx.models.Mechanic.docs[0].isAvailable = false;
    }
  };

  assert.equal((await accept(ctx.controller, flaky, request)).code, 409);
  const res = await accept(ctx.controller, steady, request, ctx.io);
  assert.equal(res.code, 200);
  assert.equal(ctx.models.ServiceRequest.docs[0].mechanicId, steady.userId);
});

test("accept: rollback only reverts THIS mechanic's own claim", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [mechanic], requests: [request] });
  ctx.models.ServiceRequest.afterClaim = (doc) => {
    ctx.models.Mechanic.docs[0].isAvailable = false;
    doc.mechanicId = "someone-else"; // request no longer belongs to this mechanic
  };
  await accept(ctx.controller, mechanic, request);
  const stored = ctx.models.ServiceRequest.docs[0];
  assert.equal(stored.mechanicId, "someone-else");
  assert.equal(stored.status, "accepted"); // untouched by our rollback
});

test("accept: still exactly one winner when claims race and every mechanic stays eligible", async () => {
  const mechanics = Array.from({ length: 8 }, () => makeMechanic());
  const request = makeRequest();
  const ctx = setup({ mechanics, requests: [request] });
  const results = await Promise.all(mechanics.map((m) => accept(ctx.controller, m, request, ctx.io)));
  assert.equal(results.filter((r) => r.code === 200).length, 1);
  assert.equal(results.filter((r) => r.code === 409).length, 7);
  const customerEvents = ctx.emitted.filter((e) => e.room === `user:${request.customerId}`);
  assert.equal(customerEvents.length, 1); // customer told once, by the winner only
});

test("accept: a mechanic who flips unavailable mid-race may leave the request pending, never double-assigned", async () => {
  const [a, b] = [makeMechanic(), makeMechanic()];
  const request = makeRequest();
  const ctx = setup({ mechanics: [a, b], requests: [request] });
  ctx.models.ServiceRequest.afterClaim = () => {
    ctx.models.Mechanic.docs[0].isAvailable = false; // whoever claims first is mechanic a
  };
  const results = await Promise.all([accept(ctx.controller, a, request), accept(ctx.controller, b, request)]);
  assert.equal(results.filter((r) => r.code === 200).length, 0); // nobody holds it twice
  assert.equal(ctx.models.ServiceRequest.docs[0].status, "pending");
  // Mechanic b simply retries and succeeds (documented limitation).
  ctx.models.ServiceRequest.afterClaim = null;
  assert.equal((await accept(ctx.controller, b, request)).code, 200);
});

// --- fail-closed verification (post-claim re-read cannot be completed) -----

// Makes the mechanic's SECOND Mechanic.findOne (the post-claim re-read) throw.
const breakReread = (ctx, userId) => {
  const real = ctx.models.Mechanic.findOne;
  const seen = {};
  ctx.models.Mechanic.findOne = (filter) => {
    seen[filter.userId] = (seen[filter.userId] || 0) + 1;
    if (filter.userId === userId && seen[filter.userId] === 2) throw new Error("db read failed");
    return real(filter);
  };
};

// After the claim (call #1), the next `failures` ServiceRequest updates throw.
const breakRollback = (ctx, failures) => {
  const real = ctx.models.ServiceRequest.findOneAndUpdate;
  let calls = 0;
  let remaining = failures;
  ctx.models.ServiceRequest.findOneAndUpdate = function (...args) {
    calls += 1;
    if (calls > 1 && remaining > 0) {
      remaining -= 1;
      throw new Error("db write failed");
    }
    return real.apply(this, args);
  };
};

const quiet = async (fn) => {
  const original = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(" "));
  try {
    return { result: await fn(), logged };
  } finally {
    console.error = original;
  }
};

test("accept FAIL-CLOSED: re-read fails -> own claim is rolled back, retryable 503, customer not told", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [mechanic], requests: [request] });
  breakReread(ctx, mechanic.userId);

  const { result: res } = await quiet(() => accept(ctx.controller, mechanic, request, ctx.io));

  assert.equal(res.code, 503);
  assert.equal(res.body.reason, "verification_unavailable");
  assert.equal(res.body.retryable, true);
  const stored = ctx.models.ServiceRequest.docs[0];
  assert.equal(stored.status, "pending");
  assert.equal(stored.mechanicId, null);
  assert.equal(stored.acceptedAt, null);
  assert.equal(ctx.emitted.filter((e) => e.room === `user:${request.customerId}`).length, 0);
});

test("accept FAIL-CLOSED: retrying after a verification outage succeeds", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [mechanic], requests: [request] });
  const realFindOne = ctx.models.Mechanic.findOne;
  breakReread(ctx, mechanic.userId);

  assert.equal((await quiet(() => accept(ctx.controller, mechanic, request))).result.code, 503);

  ctx.models.Mechanic.findOne = realFindOne; // database healthy again
  const res = await accept(ctx.controller, mechanic, request, ctx.io);
  assert.equal(res.code, 200);
  assert.equal(res.body.eligibilityVerified, true);
  assert.equal(ctx.models.ServiceRequest.docs[0].mechanicId, mechanic.userId);
});

test("accept FAIL-CLOSED: a transient rollback error is retried and the claim is released", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [mechanic], requests: [request] });
  breakReread(ctx, mechanic.userId);
  breakRollback(ctx, 1); // first rollback attempt fails, the retry works

  const { result: res } = await quiet(() => accept(ctx.controller, mechanic, request));
  assert.equal(res.code, 503);
  assert.equal(res.body.retryable, true);
  assert.equal(ctx.models.ServiceRequest.docs[0].status, "pending");
  assert.equal(ctx.models.ServiceRequest.docs[0].mechanicId, null);
});

test("accept: re-read AND rollback both fail -> claim stands, truthfully reported as accepted but unverified", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [mechanic], requests: [request] });
  breakReread(ctx, mechanic.userId);
  breakRollback(ctx, 2);

  const { result: res, logged } = await quiet(() => accept(ctx.controller, mechanic, request, ctx.io));

  assert.equal(res.code, 200);
  assert.equal(res.body.eligibilityVerified, false);
  const stored = ctx.models.ServiceRequest.docs[0];
  assert.equal(stored.status, "accepted");
  assert.equal(stored.mechanicId, mechanic.userId);
  // The customer is told, because the claim really is stored.
  assert.equal(ctx.emitted.filter((e) => e.room === `user:${request.customerId}`).length, 1);
  assert.ok(logged.some((line) => line.includes("rollback attempt 2 failed")));
});

test("accept: known-ineligible mechanic whose rollback fails gets an explicit 503 and the customer is not notified", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [mechanic], requests: [request] });
  ctx.models.ServiceRequest.afterClaim = () => {
    ctx.models.Mechanic.docs[0].isAvailable = false;
  };
  breakRollback(ctx, 2);

  const { result: res } = await quiet(() => accept(ctx.controller, mechanic, request, ctx.io));

  assert.equal(res.code, 503);
  assert.equal(res.body.reason, "release_failed");
  assert.equal(ctx.emitted.filter((e) => e.room === `user:${request.customerId}`).length, 0);
  // The limitation is real and visible: the claim could not be removed.
  assert.equal(ctx.models.ServiceRequest.docs[0].status, "accepted");
});

test("accept FAIL-CLOSED: rollback never touches a claim that belongs to someone else", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [mechanic], requests: [request] });
  breakReread(ctx, mechanic.userId);
  ctx.models.ServiceRequest.afterClaim = (doc) => {
    doc.mechanicId = "someone-else";
  };

  await quiet(() => accept(ctx.controller, mechanic, request));

  const stored = ctx.models.ServiceRequest.docs[0];
  assert.equal(stored.mechanicId, "someone-else");
  assert.equal(stored.status, "accepted");
});

test("accept FAIL-CLOSED: race where the first claimant's verification fails never double-assigns", async () => {
  const [a, b] = [makeMechanic(), makeMechanic()];
  const request = makeRequest();
  const ctx = setup({ mechanics: [a, b], requests: [request] });
  breakReread(ctx, a.userId);

  const { result: results } = await quiet(() =>
    Promise.all([accept(ctx.controller, a, request), accept(ctx.controller, b, request)]),
  );

  assert.equal(results.filter((r) => r.code === 200).length, 0);
  assert.equal(ctx.models.ServiceRequest.docs[0].status, "pending");
  assert.equal(ctx.models.ServiceRequest.docs[0].mechanicId, null);
  assert.equal((await accept(ctx.controller, b, request)).code, 200); // b retries
});

test("accept: a normal successful accept reports eligibilityVerified true", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest();
  const ctx = setup({ mechanics: [mechanic], requests: [request] });
  const res = await accept(ctx.controller, mechanic, request);
  assert.equal(res.code, 200);
  assert.equal(res.body.eligibilityVerified, true);
});

// ============================ 3. mechanic location: save -> persist -> use

const profileCtx = (mechanic, requests = []) =>
  loadWithFakes("controllers/mechanicController.js", { mechanics: [mechanic], requests });

const saveProfile = async (ctx, mechanic, body) => {
  const res = mockRes();
  await ctx.controller.updateMyMechanicProfile(mockReq({ userId: mechanic.userId, body }), res);
  return res;
};

test("profile: valid coordinates are saved, persisted, and then used by the request list", async () => {
  const mechanic = makeMechanic({ location: undefined });
  const request = makeRequest({ location: { address: "x", ...at(4) } });
  const ctx = profileCtx(mechanic, [request]);

  // Before saving a location the pinned request is hidden.
  const dist = loadWithFakes("controllers/mechanicRequestController.js", {
    mechanics: ctx.models.Mechanic.docs,
    requests: [request],
  });
  assert.equal((await list(dist.controller, mechanic)).body.availableRequests.length, 0);

  const res = await saveProfile(ctx, mechanic, { location: { latitude: 12.9716, longitude: 77.5946 } });
  assert.equal(res.code, 200);
  assert.deepEqual(ctx.models.Mechanic.docs[0].location, { latitude: 12.9716, longitude: 77.5946 });

  // Same persisted record now drives the list.
  const after = await list(dist.controller, ctx.models.Mechanic.docs[0]);
  assert.equal(after.body.availableRequests.length, 1);
  assert.equal(after.body.locationMissing, false);
});

test("profile: invalid coordinates are rejected and nothing is persisted", async () => {
  const bad = [
    { latitude: 91, longitude: 77 },
    { latitude: -91, longitude: 77 },
    { latitude: 12, longitude: 181 },
    { latitude: 12, longitude: -181 },
    { latitude: "12.9", longitude: 77 }, // strings are not accepted by the API
    { latitude: 12.9 },
    { longitude: 77.5 },
    { latitude: null, longitude: null },
    { latitude: NaN, longitude: 77 },
    { latitude: 0, longitude: 0 },
    null,
  ];
  for (const location of bad) {
    const mechanic = makeMechanic({ location: undefined });
    const ctx = profileCtx(mechanic);
    const res = await saveProfile(ctx, mechanic, { location });
    assert.equal(res.code, 400, JSON.stringify(location));
    assert.equal(ctx.models.Mechanic.docs[0].location, undefined, JSON.stringify(location));
  }
});

test("profile: non-string serviceArea / bio give 400, not a server error", async () => {
  for (const body of [{ serviceArea: 5 }, { serviceArea: {} }, { bio: 7 }, { bio: [] }]) {
    const mechanic = makeMechanic();
    const res = await saveProfile(profileCtx(mechanic), mechanic, body);
    assert.equal(res.code, 400, JSON.stringify(body));
  }
});

// ================================= 4. creation + notifications (no leaks)

const createCtx = (mechanics, extra = {}) => {
  const customerId = "c".repeat(24);
  const vehicle = { _id: "a".repeat(24), userId: customerId };
  const ctx = loadWithFakes("controllers/serviceRequestController.js", {
    mechanics,
    vehicles: [vehicle],
    ...extra,
  });
  return { ...ctx, customerId, vehicle };
};

const submit = async (ctx, overrides = {}) => {
  const res = mockRes();
  await ctx.controller.createServiceRequest(
    mockReq({
      userId: ctx.customerId,
      io: ctx.io,
      body: {
        vehicleId: ctx.vehicle._id,
        serviceType: "Towing",
        problemDescription: "Engine stopped and will not restart",
        location: { address: "MG Road, Bengaluru", ...at(0) },
        ...overrides,
      },
    }),
    res,
  );
  await flush();
  return res;
};

test("create (pinned): only ELIGIBLE mechanics are notified; nobody else receives anything", async () => {
  const eligible = makeMechanic();
  const sameServiceFar = makeMechanic({ location: at(90) });
  const noLocation = makeMechanic({ location: undefined });
  const wrongService = makeMechanic({ services: ["Oil Change"] });
  const unavailable = makeMechanic({ isAvailable: false });
  const pending = makeMechanic({ verificationStatus: "pending" });
  const ctx = createCtx([eligible, sameServiceFar, noLocation, wrongService, unavailable, pending]);

  const res = await submit(ctx);
  assert.equal(res.code, 201);

  assert.deepEqual(ctx.emitted.map((e) => e.room), [`user:${eligible.userId}`]);
});

test("create: socket payloads never contain address, coordinates, description or customer data", async () => {
  const eligible = makeMechanic();
  const ctx = createCtx([eligible]);
  await submit(ctx);

  assert.equal(ctx.emitted.length, 1);
  const serialized = JSON.stringify(ctx.emitted[0].payload);
  for (const secret of ["MG Road", "Engine stopped", ctx.customerId, "latitude", "longitude", "12.97"]) {
    assert.ok(!serialized.includes(secret), `payload leaked "${secret}"`);
  }
  assert.deepEqual(
    Object.keys(ctx.emitted[0].payload).sort(),
    ["message", "requestId", "status", "updatedAt"],
  );
});

test("create (no coordinates): documented fallback - every approved, available, service-matching mechanic is notified", async () => {
  const near = makeMechanic();
  const far = makeMechanic({ location: at(90) });
  const noLocation = makeMechanic({ location: undefined });
  const wrongService = makeMechanic({ services: ["Oil Change"] });
  const unavailable = makeMechanic({ isAvailable: false });
  const ctx = createCtx([near, far, noLocation, wrongService, unavailable]);

  const res = await submit(ctx, { location: { address: "behind the old market" } });
  assert.equal(res.code, 201);

  assert.deepEqual(
    ctx.emitted.map((e) => e.room).sort(),
    [near, far, noLocation].map((m) => `user:${m.userId}`).sort(),
  );
});

test("create: half-specified coordinates are rejected and nothing is notified", async () => {
  const ctx = createCtx([makeMechanic()]);
  const res = await submit(ctx, { location: { address: "x", latitude: 12.9 } });
  assert.equal(res.code, 400);
  assert.equal(ctx.emitted.length, 0);
  assert.equal(ctx.models.ServiceRequest.docs.length, 0);
});

test("create: a second open request for the same vehicle is refused", async () => {
  const ctx = createCtx([makeMechanic()]);
  assert.equal((await submit(ctx)).code, 201);
  const second = await submit(ctx);
  assert.equal(second.code, 409);
  assert.equal(ctx.models.ServiceRequest.docs.length, 1);
});
