import { useEffect, useState } from "react";
import { socket } from "../socket";

export default function RealtimeNotifications() {
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const handleUpdate = (event) => {
      // New mechanic requests are shown in the persistent notification centre.
      // Keep this legacy banner for customer status updates without duplicating it.
      if (event.message?.includes("request is waiting.")) return;
      setNotification(event);
    };

    socket.on("service_request_updated", handleUpdate);

    return () => {
      socket.off("service_request_updated", handleUpdate);
    };
  }, []);

  if (!notification) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900"
    >
      <div>
        <p className="font-semibold">RoadSafe service update</p>

        <p className="mt-1 text-sm">{notification.message}</p>

        <p className="mt-1 text-xs text-blue-700">
          Request ID: {notification.requestId}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setNotification(null)}
        aria-label="Dismiss notification"
        className="rounded px-2 py-1 text-sm hover:bg-blue-100"
      >
        Dismiss
      </button>
    </div>
  );
}
