const Notification = require("../models/Notification");

// Persistent, idempotent notification. The database record is written before
// Socket.IO emits, so offline users can retrieve it on their next login.
const createPersistentNotification = async (req, {
  recipientId,
  recipientRole,
  type,
  title,
  message,
  requestId,
  link,
  metadata = {},
  dedupeKey,
}) => {
  try {
    const id = recipientId?._id?.toString() || recipientId?.toString();
    if (!id || !dedupeKey) return null;

    let inserted = false;
    try {
      const result = await Notification.updateOne(
        { recipientId: id, dedupeKey },
        {
          $setOnInsert: {
            recipientId: id,
            recipientRole,
            type,
            title,
            message,
            requestId,
            link,
            metadata,
            dedupeKey,
            readAt: null,
          },
        },
        { upsert: true },
      );
      inserted = Boolean(result.upsertedCount);
    } catch (error) {
      // A simultaneous retry may win the unique index. It is not a new event.
      if (error.code !== 11000) throw error;
    }

    const notification = await Notification.findOne({
      recipientId: id,
      dedupeKey,
    }).lean();

    if (inserted && notification) {
      const io = req.app.get("io");
      if (io) io.to(`user:${id}`).emit("notification:new", notification);
    }

    return notification;
  } catch (error) {
    // Notification failures must not undo a successfully created/accepted request.
    console.error("Persistent notification error:", error.message);
    return null;
  }
};

// Existing lightweight service-update events remain for current dashboard refreshes.
const notifyUser = (req, userId, payload) => {
  try {
    const io = req.app.get("io");
    const id = userId?._id?.toString() || userId?.toString();

    if (!io || !id) return;

    io.to(`user:${id}`).emit("service_request_updated", {
      ...payload,
      updatedAt: payload.updatedAt || new Date().toISOString(),
    });
  } catch (error) {
    console.error("Notification error:", error.message);
  }
};

// Lightweight "reload your list" ping for mechanics. It carries no request data.
const pingMechanics = (req) => {
  try {
    const io = req.app.get("io");
    if (io) io.to("mechanics").emit("available_requests_changed");
  } catch (error) {
    console.error("Mechanic ping error:", error.message);
  }
};

module.exports = {
  notifyUser,
  pingMechanics,
  createPersistentNotification,
};
