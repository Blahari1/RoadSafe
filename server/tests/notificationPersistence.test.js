const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const notificationPath = path.join(__dirname, "..", "models", "Notification.js");
const notifyPath = path.join(__dirname, "..", "utils", "notify.js");

const loadNotifyWithFake = () => {
  const originalLoad = Module._load;
  const docs = [];
  const fakeNotification = {
    updateOne: async (filter, update) => {
      const existing = docs.find(
        (item) =>
          String(item.recipientId) === String(filter.recipientId) &&
          item.dedupeKey === filter.dedupeKey,
      );
      if (existing) return { upsertedCount: 0 };
      docs.push({ ...update.$setOnInsert, _id: `notification-${docs.length + 1}`, createdAt: new Date() });
      return { upsertedCount: 1 };
    },
    findOne: (filter) => ({
      lean: async () =>
        docs.find(
          (item) =>
            String(item.recipientId) === String(filter.recipientId) &&
            item.dedupeKey === filter.dedupeKey,
        ) || null,
    }),
  };

  Module._load = function (request, ...args) {
    if (request.endsWith("models/Notification") || request === "../models/Notification") {
      return fakeNotification;
    }
    return originalLoad.call(this, request, ...args);
  };

  delete require.cache[notifyPath];
  const notify = require(notifyPath);
  Module._load = originalLoad;

  return { notify, docs };
};

const requestContext = (io) => ({
  app: { get: (key) => (key === "io" ? io : undefined) },
});

test("persistent notification is stored before emitting to the intended user's room", async () => {
  const { notify, docs } = loadNotifyWithFake();
  const emitted = [];
  const io = {
    to: (room) => ({
      emit: (event, payload) => emitted.push({ room, event, payload }),
    }),
  };

  const notification = await notify.createPersistentNotification(
    requestContext(io),
    {
      recipientId: "customer-1",
      recipientRole: "customer",
      type: "service_request_accepted",
      title: "Mechanic accepted your request",
      message: "Your service request has been accepted!",
      requestId: "request-1",
      link: "/service-history/request-1",
      dedupeKey: "request-accepted:request-1",
      metadata: { mechanicName: "Test Mechanic" },
    },
  );

  assert.equal(docs.length, 1);
  assert.equal(notification.recipientId, "customer-1");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].room, "user:customer-1");
  assert.equal(emitted[0].event, "notification:new");
});

test("retries with the same idempotency key do not create or emit duplicates", async () => {
  const { notify, docs } = loadNotifyWithFake();
  const emitted = [];
  const io = {
    to: (room) => ({
      emit: (event, payload) => emitted.push({ room, event, payload }),
    }),
  };
  const payload = {
    recipientId: "mechanic-1",
    recipientRole: "mechanic",
    type: "service_request_received",
    title: "New service request",
    message: "A customer needs roadside assistance.",
    requestId: "request-2",
    link: "/mechanic/requests",
    dedupeKey: "request-offered:request-2",
  };

  await notify.createPersistentNotification(requestContext(io), payload);
  await notify.createPersistentNotification(requestContext(io), payload);

  assert.equal(docs.length, 1);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].room, "user:mechanic-1");
});

test("offline recipient still gets a persisted notification without a socket", async () => {
  const { notify, docs } = loadNotifyWithFake();

  const notification = await notify.createPersistentNotification(
    requestContext(null),
    {
      recipientId: "mechanic-offline",
      recipientRole: "mechanic",
      type: "service_request_received",
      title: "New service request",
      message: "A customer needs roadside assistance.",
      requestId: "request-3",
      link: "/mechanic/requests",
      dedupeKey: "request-offered:request-3",
    },
  );

  assert.equal(docs.length, 1);
  assert.equal(notification.recipientId, "mechanic-offline");
});
