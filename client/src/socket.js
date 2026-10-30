import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:1910";

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  auth: (callback) => {
    callback({
      token: localStorage.getItem("roadSafeToken"),
    });
  },
});

export const connectSocket = () => {
  const token = localStorage.getItem("roadSafeToken");

  if (!token) {
    return;
  }

  socket.auth = {
    token,
  };

  if (!socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = () => {
  socket.disconnect();
};
