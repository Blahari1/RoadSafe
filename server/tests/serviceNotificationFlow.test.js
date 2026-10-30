const test = require("node:test");
const assert = require("node:assert/strict");
const {
  loadWithFakes,
  mockReq,
  mockRes,
  makeMechanic,
  makeRequest,
} = require("./helpers/fakes");

test("successful mechanic acceptance persists one notification for the owning customer", async () => {
  const mechanic = makeMechanic();
  const request = makeRequest({
    customerId: "000000000000000000000099",
    mechanicId: null,
    status: "pending",
  });
  const ctx = loadWithFakes("controllers/mechanicRequestController.js", {
    mechanics: [mechanic],
    requests: [request],
    notifications: true,
  });

  const res = mockRes();
  await ctx.controller.acceptServiceRequest(
    mockReq({
      userId: mechanic.userId,
      params: { id: request._id },
      io: ctx.io,
    }),
    res,
  );

  assert.equal(res.code, 200);
  assert.equal(ctx.models.Notification.docs.length, 1);

  const notification = ctx.models.Notification.docs[0];
  assert.equal(notification.recipientId, request.customerId);
  assert.equal(notification.recipientRole, "customer");
  assert.equal(notification.type, "service_request_accepted");
  assert.equal(notification.dedupeKey, `request-accepted:${request._id}`);
  assert.equal(notification.link, `/service-history/${request._id}`);
  assert.equal(
    notification.message,
    "Your service request has been accepted! Your mechanic is on the way.",
  );

  const realtime = ctx.emitted.find((event) => event.event === "notification:new");
  assert.equal(realtime.room, `user:${request.customerId}`);
});

test("an ineligible mechanic cannot create a customer acceptance notification", async () => {
  const mechanic = makeMechanic({ isAvailable: false });
  const request = makeRequest({ customerId: "000000000000000000000099" });
  const ctx = loadWithFakes("controllers/mechanicRequestController.js", {
    mechanics: [mechanic],
    requests: [request],
    notifications: true,
  });

  const res = mockRes();
  await ctx.controller.acceptServiceRequest(
    mockReq({
      userId: mechanic.userId,
      params: { id: request._id },
      io: ctx.io,
    }),
    res,
  );

  assert.equal(res.code, 403);
  assert.equal(ctx.models.Notification.docs.length, 0);
});
