const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_MAX_RADIUS_KM,
  MAX_ALLOWED_RADIUS_KM,
  getMaxRadiusKm,
  evaluateEligibility,
} = require("../utils/eligibility");
const { at, makeMechanic, makeRequest } = require("./helpers/fakes");

test("radius: default, override, and invalid values", () => {
  assert.equal(DEFAULT_MAX_RADIUS_KM, 25);
  assert.equal(getMaxRadiusKm({}), 25);
  assert.equal(getMaxRadiusKm({ MECHANIC_MAX_RADIUS_KM: "10" }), 10);
  assert.equal(getMaxRadiusKm({ MECHANIC_MAX_RADIUS_KM: "7.5" }), 7.5);
  for (const bad of ["", "abc", "0", "-5", "NaN", "Infinity"]) {
    assert.equal(getMaxRadiusKm({ MECHANIC_MAX_RADIUS_KM: bad }), 25, `value ${bad}`);
  }
  assert.equal(getMaxRadiusKm({ MECHANIC_MAX_RADIUS_KM: "99999" }), MAX_ALLOWED_RADIUS_KM);
});

test("eligibility: matching service, in range -> eligible with a real distance", () => {
  const v = evaluateEligibility({
    mechanic: makeMechanic(),
    request: makeRequest({ location: { address: "x", ...at(5) } }),
    maxRadiusKm: 25,
  });
  assert.equal(v.eligible, true);
  assert.equal(v.reason, null);
  assert.equal(v.distanceKnown, true);
  assert.ok(Math.abs(v.distanceKm - 5) < 0.1, `got ${v.distanceKm}`);
});

test("eligibility: service type must match", () => {
  const v = evaluateEligibility({
    mechanic: makeMechanic({ services: ["Oil Change"] }),
    request: makeRequest({ serviceType: "Towing" }),
    maxRadiusKm: 25,
  });
  assert.equal(v.eligible, false);
  assert.equal(v.reason, "service_mismatch");
});

test("eligibility: radius boundary is inclusive, beyond it is out_of_range", () => {
  const mechanic = makeMechanic();
  const near = evaluateEligibility({
    mechanic,
    request: makeRequest({ location: { address: "x", ...at(24.9) } }),
    maxRadiusKm: 25,
  });
  const far = evaluateEligibility({
    mechanic,
    request: makeRequest({ location: { address: "x", ...at(25.5) } }),
    maxRadiusKm: 25,
  });
  assert.equal(near.eligible, true);
  assert.equal(far.eligible, false);
  assert.equal(far.reason, "out_of_range");
  assert.ok(far.distanceKm > 25); // the real distance is still reported
});

test("eligibility: request without coordinates -> eligible, distance null (not invented)", () => {
  const v = evaluateEligibility({
    mechanic: makeMechanic(),
    request: makeRequest({ location: { address: "near the temple" } }),
    maxRadiusKm: 25,
  });
  assert.equal(v.eligible, true);
  assert.equal(v.distanceKm, null);
  assert.equal(v.distanceKnown, false);
});

test("eligibility: pinned request but mechanic has no coordinates -> not eligible", () => {
  for (const location of [undefined, {}, { latitude: null, longitude: null }, { latitude: 12.9 }]) {
    const v = evaluateEligibility({
      mechanic: makeMechanic({ location }),
      request: makeRequest(),
      maxRadiusKm: 25,
    });
    assert.equal(v.eligible, false);
    assert.equal(v.reason, "mechanic_location_missing");
    assert.equal(v.distanceKm, null);
  }
});

test("eligibility: invalid coordinates are treated as missing", () => {
  const v = evaluateEligibility({
    mechanic: makeMechanic(),
    request: makeRequest({ location: { address: "x", latitude: 999, longitude: 77 } }),
    maxRadiusKm: 25,
  });
  assert.equal(v.eligible, true);
  assert.equal(v.distanceKm, null);
});

test("eligibility: availability and approval are required", () => {
  const request = makeRequest();
  assert.equal(
    evaluateEligibility({ mechanic: makeMechanic({ isAvailable: false }), request }).reason,
    "not_available",
  );
  for (const status of ["pending", "rejected", undefined]) {
    assert.equal(
      evaluateEligibility({ mechanic: makeMechanic({ verificationStatus: status }), request }).reason,
      "not_approved",
    );
  }
  assert.equal(evaluateEligibility({ mechanic: null, request }).reason, "not_approved");
});
