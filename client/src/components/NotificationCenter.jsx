import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { socket } from "../socket";

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
};

export default function NotificationCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/notifications");
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
      setError("");
    } catch {
      setError("Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => loadNotifications(), 0);

    const handleNewNotification = (notification) => {
      setNotifications((current) => {
        if (current.some((item) => item._id === notification._id)) return current;
        return [notification, ...current].slice(0, 50);
      });
      if (!notification.readAt) {
        setUnreadCount((count) => count + 1);
      }
    };

    socket.on("notification:new", handleNewNotification);
    return () => {
      clearTimeout(initialLoad);
      socket.off("notification:new", handleNewNotification);
    };
  }, [loadNotifications]);

  const openNotification = async (notification) => {
    if (!notification.readAt) {
      try {
        await api.patch(`/notifications/${notification._id}/read`);
        setNotifications((items) =>
          items.map((item) =>
            item._id === notification._id
              ? { ...item, readAt: new Date().toISOString() }
              : item,
          ),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        // Navigation remains useful even if marking read temporarily fails.
      }
    }

    setOpen(false);
    if (notification.link) navigate(notification.link);
  };

  const markAllRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      const now = new Date().toISOString();
      setNotifications((items) =>
        items.map((item) => ({ ...item, readAt: item.readAt || now })),
      );
      setUnreadCount(0);
    } catch {
      setError("Unable to mark notifications as read.");
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) loadNotifications();
        }}
        className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <section
            aria-label="Notifications"
            className="absolute right-0 z-50 mt-3 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="font-semibold text-slate-900">Notifications</h2>
                <p className="text-xs text-slate-500">
                  {unreadCount} unread
                </p>
              </div>
              <button
                type="button"
                onClick={markAllRead}
                disabled={!unreadCount}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            </div>

            <div className="max-h-[26rem] overflow-y-auto">
              {loading && notifications.length === 0 ? (
                <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
                  <LoaderCircle size={18} className="animate-spin" />
                  Loading...
                </div>
              ) : error && notifications.length === 0 ? (
                <p role="alert" className="p-5 text-sm text-red-600">{error}</p>
              ) : notifications.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  You have no notifications yet.
                </p>
              ) : (
                notifications.map((notification) => (
                  <button
                    type="button"
                    key={notification._id}
                    onClick={() => openNotification(notification)}
                    className={`block w-full border-b border-slate-100 px-4 py-4 text-left transition hover:bg-slate-50 ${
                      notification.readAt ? "bg-white" : "bg-blue-50/70"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      {!notification.readAt && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">
                          {notification.title}
                        </span>
                        <span className="mt-1 block text-sm leading-5 text-slate-600">
                          {notification.message}
                        </span>
                        {notification.metadata?.serviceType && (
                          <span className="mt-2 block text-xs text-slate-500">
                            {notification.metadata.serviceType}
                            {notification.metadata.vehicle
                              ? ` · ${notification.metadata.vehicle}`
                              : ""}
                            {notification.metadata.mechanicName
                              ? ` · ${notification.metadata.mechanicName}`
                              : ""}
                          </span>
                        )}
                        {notification.metadata?.location && (
                          <span className="mt-1 block text-xs text-slate-500">
                            {notification.metadata.location}
                          </span>
                        )}
                        <span className="mt-2 block text-[11px] text-slate-400">
                          {formatTime(notification.createdAt)}
                        </span>
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
