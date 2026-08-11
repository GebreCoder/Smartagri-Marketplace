import { io } from "socket.io-client";
import { getToken } from "./api.js";

let socketRef = null;

/**
 * Get the authenticated socket instance (created lazily).
 * Components call socket.on / socket.off directly; the connection is
 * established once per page load.
 */
export const getSocket = () => {
  if (socketRef) return socketRef;

  const token = getToken();
  socketRef = io({
    autoConnect: Boolean(token),
    auth: { token },
  });

  socketRef.on("connect_error", () => {
    // e.g. expired token — the app will surface an auth error elsewhere.
  });

  return socketRef;
};

/** Subscribe a listener to an event, returning an unsubscribe fn. */
export const onSocketEvent = (event, handler) => {
  const socket = getSocket();
  socket.on(event, handler);
  return () => socket.off(event, handler);
};

/** Disconnect and drop the cached instance (used on logout). */
export const disconnectSocket = () => {
  if (socketRef) {
    socketRef.disconnect();
    socketRef = null;
  }
};
