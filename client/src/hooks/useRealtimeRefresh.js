import { useEffect, useRef } from "react";
import { socket } from "../socket";

// Calls `callback` whenever the server pushes one of the given Socket.IO
// events (default: a status update for one of this user's requests).
export default function useRealtimeRefresh(
  callback,
  events = ["service_request_updated"],
) {
  const callbackRef = useRef(callback);
  const eventKey = events.join("|");

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const names = eventKey.split("|");
    const handler = () => callbackRef.current();

    names.forEach((name) => socket.on(name, handler));

    return () => {
      names.forEach((name) => socket.off(name, handler));
    };
  }, [eventKey]);
}
