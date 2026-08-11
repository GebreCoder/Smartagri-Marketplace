import { io } from "socket.io-client";
import { getToken } from "./api.js";

let socketRef = null;
// Token the current socket was created with. If it ever differs from the
// live token, the socket is stale (old user / expired session) and must be
// recreated — otherwise realtime events silently route to the wrong user.
let socketToken = null;

/**
 * Get the authenticated socket instance (created lazily).
 * Components call socket.on / socket.off directly; the connection is
 * established once per page load.
 *
 * Self-healing: if the stored JWT changed since the socket was created
 * (login / logout / re-login as a different user), the old socket is torn
 * down and a fresh one is created under the current session.
 */
export const getSocket = () => {
  const token = getToken();
  if (socketRef && socketToken === token) return socketRef;

  if (socketRef) {
    socketRef.disconnect();
    socketRef = null;
  }

  socketToken = token;
  socketRef = io({
    autoConnect: Boolean(token),
    auth: { token },
  });

  socketRef.on("connect_error", () => {
    // e.g. expired token — the app will surface an auth error elsewhere.
  });

  return socketRef;
};

/**
 * Drop the cached instance and force a fresh socket on the next getSocket().
 * Called on login / logout so realtime never lingers under an old identity.
 */
export const resetSocket = () => {
  if (socketRef) {
    socketRef.disconnect();
    socketRef = null;
  }
  socketToken = null;
};

/** Subscribe a listener to an event, returning an unsubscribe fn. */
export const onSocketEvent = (event, handler) => {
  const socket = getSocket();
  socket.on(event, handler);
  return () => socket.off(event, handler);
};

/** Disconnect and drop the cached instance (used on logout). */
export const disconnectSocket = () => {
  resetSocket();
};
