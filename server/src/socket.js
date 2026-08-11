import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

let ioRef = null;

/**
 * Attach Socket.IO to the HTTP server. Must be called once from index.js.
 */
export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // Authenticate every socket with the JWT passed as handshake auth.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("unauthorized"));
      const payload = jwt.verify(token, config.jwtSecret);
      socket.user = payload;
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user?.id;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // ChatPage joins its order room to receive message events live.
    socket.on("join-order", (orderId) => {
      if (orderId) socket.join(`order:${String(orderId)}`);
    });

    socket.on("leave-order", (orderId) => {
      if (orderId) socket.leave(`order:${String(orderId)}`);
    });
  });

  ioRef = io;
  return io;
};

export const getIo = () => ioRef;

/** Emit to every connected client (used for marketplace product changes). */
export const emitGlobal = (event, data) => {
  if (ioRef) ioRef.emit(event, data);
};

/** Emit to a single user's room. */
export const emitToUser = (userId, event, data) => {
  if (ioRef && userId) ioRef.to(`user:${String(userId)}`).emit(event, data);
};

/** Emit to an order room (ChatPage listeners). */
export const emitToOrder = (orderId, event, data) => {
  if (ioRef && orderId) ioRef.to(`order:${String(orderId)}`).emit(event, data);
};

/**
 * Notify both sides of an order (buyer + farmer) that something changed.
 */
export const emitOrderChanged = (orderId, buyerId, farmerId) => {
  const payload = { orderId };
  emitToUser(buyerId, "order:changed", payload);
  emitToUser(farmerId, "order:changed", payload);
};

/**
 * Notify everyone in a chat (order room + both participants) of a new message.
 */
export const emitMessageNew = ({ orderId, senderId, receiverId }) => {
  const payload = { orderId };
  emitToOrder(orderId, "message:new", payload);
  emitToUser(senderId, "message:new", payload);
  emitToUser(receiverId, "message:new", payload);
};
