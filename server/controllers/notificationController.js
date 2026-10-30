const Notification = require("../models/Notification");
const { isObjectIdString } = require("../utils/ids");

// GET /api/notifications - only the authenticated user's notifications.
const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientId: req.user.userId,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = await Notification.countDocuments({
      recipientId: req.user.userId,
      readAt: null,
    });

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Get notifications error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load notifications.",
    });
  }
};

// PATCH /api/notifications/:id/read - ownership is part of the update filter.
const markNotificationRead = async (req, res) => {
  try {
    if (!isObjectIdString(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid notification ID." });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.userId },
      { $set: { readAt: new Date() } },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    return res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error("Mark notification read error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update notification." });
  }
};

// PATCH /api/notifications/read-all
const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientId: req.user.userId, readAt: null },
      { $set: { readAt: new Date() } },
    );

    return res.status(200).json({ success: true, message: "All notifications marked as read." });
  } catch (error) {
    console.error("Mark all notifications read error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update notifications." });
  }
};

module.exports = {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
