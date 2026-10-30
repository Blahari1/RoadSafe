// Run with: npm test   (uses Node's built-in test runner; no database needed)
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateReviewInput,
  validateInvoiceInput,
  escapeRegex,
  parsePagination,
} = require("../utils/validators");
const { distanceKm, isValidLatitude, isValidLongitude } = require("../utils/geo");
const { getMechanicTransition } = require("../utils/requestStatus");

test("review: accepts whole ratings 1-5 and trims the comment", () => {
  for (const rating of [1, 2, 3, 4, 5]) {
    const result = validateReviewInput({ rating, comment: "  good  " });
    assert.equal(result.error, undefined);
    assert.deepEqual(result.value, { rating, comment: "good" });
  }
});

test("review: comment is optional", () => {
  assert.deepEqual(validateReviewInput({ rating: 4 }).value, {
    rating: 4,
    comment: "",
  });
});

test("review: rejects invalid ratings", () => {
  for (const rating of [0, 6, -1, 3.5, "5", null, undefined, NaN, Infinity]) {
    assert.ok(validateReviewInput({ rating }).error, `rating ${rating}`);
  }
  assert.ok(validateReviewInput(undefined).error);
});

test("review: rejects non-string and over-long comments", () => {
  assert.ok(validateReviewInput({ rating: 5, comment: 42 }).error);
  assert.ok(validateReviewInput({ rating: 5, comment: "x".repeat(501) }).error);
  assert.equal(
    validateReviewInput({ rating: 5, comment: "x".repeat(500) }).error,
    undefined,
  );
});

test("invoice: computes the total on the server in exact minor units", () => {
  const result = validateInvoiceInput({
    lineItems: [
      { description: "Labour", amount: 0.1 },
      { description: "Parts", amount: 0.2 },
    ],
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.totalAmount, 0.3); // not 0.30000000000000004
});

test("invoice: rejects empty, oversized, or malformed charges", () => {
  assert.ok(validateInvoiceInput({}).error);
  assert.ok(validateInvoiceInput({ lineItems: [] }).error);
  assert.ok(
    validateInvoiceInput({
      lineItems: Array.from({ length: 11 }, () => ({ description: "x", amount: 1 })),
    }).error,
  );
  assert.ok(validateInvoiceInput({ lineItems: [{ description: "", amount: 5 }] }).error);
  assert.ok(validateInvoiceInput({ lineItems: [{ description: "x", amount: "5" }] }).error);
  assert.ok(validateInvoiceInput({ lineItems: [{ description: "x", amount: -1 }] }).error);
  assert.ok(validateInvoiceInput({ lineItems: [{ description: "x", amount: 1.234 }] }).error);
  assert.ok(validateInvoiceInput({ lineItems: [{ description: "x", amount: 2e6 }] }).error);
  assert.ok(validateInvoiceInput({ lineItems: [{ description: "x", amount: NaN }] }).error);
});

test("invoice: total must be greater than zero", () => {
  assert.ok(validateInvoiceInput({ lineItems: [{ description: "x", amount: 0 }] }).error);
});

test("invoice: notes are validated", () => {
  const base = [{ description: "Towing", amount: 500 }];
  assert.ok(validateInvoiceInput({ lineItems: base, notes: 5 }).error);
  assert.ok(validateInvoiceInput({ lineItems: base, notes: "x".repeat(301) }).error);
  assert.equal(validateInvoiceInput({ lineItems: base, notes: " ok " }).value.notes, "ok");
});

test("geo: coordinate validation", () => {
  assert.ok(isValidLatitude(90) && isValidLatitude(-90) && isValidLatitude(0));
  assert.ok(!isValidLatitude(90.1) && !isValidLatitude("1") && !isValidLatitude(NaN));
  assert.ok(isValidLongitude(180) && isValidLongitude(-180));
  assert.ok(!isValidLongitude(181) && !isValidLongitude(null));
});

test("geo: haversine distance is plausible", () => {
  assert.equal(distanceKm(12.9716, 77.5946, 12.9716, 77.5946), 0);
  // Bengaluru -> Mysuru is roughly 125 km in a straight line.
  const d = distanceKm(12.9716, 77.5946, 12.2958, 76.6394);
  assert.ok(d > 120 && d < 135, `got ${d}`);
  // Symmetric
  assert.ok(
    Math.abs(distanceKm(1, 2, 3, 4) - distanceKm(3, 4, 1, 2)) < 1e-9,
  );
});

test("status transitions: only accepted->in_progress and in_progress->completed", () => {
  assert.deepEqual(getMechanicTransition("in_progress"), {
    from: "accepted",
    timestampField: "startedAt",
  });
  assert.deepEqual(getMechanicTransition("completed"), {
    from: "in_progress",
    timestampField: "completedAt",
  });
  for (const status of ["pending", "accepted", "cancelled", "toString", "__proto__", undefined]) {
    assert.equal(getMechanicTransition(status), null, String(status));
  }
});

test("search helpers", () => {
  assert.equal(escapeRegex("a.b*c"), "a\\.b\\*c");
  assert.deepEqual(parsePagination({}), { page: 1, limit: 20, skip: 0 });
  assert.deepEqual(parsePagination({ page: "3", limit: "10" }), {
    page: 3,
    limit: 10,
    skip: 20,
  });
  assert.equal(parsePagination({ limit: "9999" }).limit, 100);
  assert.equal(parsePagination({ page: "-4" }).page, 1);
});
