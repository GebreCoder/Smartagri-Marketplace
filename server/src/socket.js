import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

let ioRef = null;

// userId → Set of active socket ids (online presence tracking).
const onlineSockets = new Map();

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
      if (!onlineSockets.has(userId)) onlineSockets.set(userId, new Set());
      onlineSockets.get(userId).add(socket.id);
      // Let everyone know this user just came online.
      io.emit("presence:update", { userId, online: true });
    }

    socket.on("disconnect", () => {
      if (!userId) return;
      const sockets = onlineSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineSockets.delete(userId);
          io.emit("presence:update", { userId, online: false });
        }
      }
    });

    // ChatPage joins its order room to receive message events live.
    socket.on("join-order", (orderId) => {
      if (orderId) socket.join(`order:${String(orderId)}`);
    });

    socket.on("leave-order", (orderId) => {
      if (orderId) socket.leave(`order:${String(orderId)}`);
    });

    // Messenger joins a direct-conversation room.
    socket.on("join-conversation", (conversationId) => {
      if (conversationId) socket.join(`conversation:${String(conversationId)}`);
    });

    socket.on("leave-conversation", (conversationId) => {
      if (conversationId) socket.leave(`conversation:${String(conversationId)}`);
    });

    // Typing indicators — relay to everyone in the conversation room.
    socket.on("typing", (conversationId) => {
      if (conversationId) {
        socket.to(`conversation:${String(conversationId)}`).emit("typing:start", {
          conversationId,
          userId,
        });
      }
    });

    socket.on("typing:stop", (conversationId) => {
      if (conversationId) {
        socket.to(`conversation:${String(conversationId)}`).emit("typing:stop", {
          conversationId,
          userId,
        });
      }
    });
  });

  ioRef = io;
  return io;
};

export const getIo = () => ioRef;

/** Snapshot of currently-online user ids. */
export const getOnlineUserIds = () => new Set(onlineSockets.keys());

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
 * Notify everyone in an order chat (order room + both participants) of a new message.
 */
export const emitMessageNew = ({ orderId, senderId, receiverId }) => {
  const payload = { orderId };
  emitToOrder(orderId, "message:new", payload);
  emitToUser(senderId, "message:new", payload);
  emitToUser(receiverId, "message:new", payload);
};

/**
 * Notify both participants + the conversation room of a new direct message.
 */
export const emitDirectMessage = ({ conversationId, senderId, receiverId, message, imageUrl, senderName }) => {
  const payload = { conversationId, senderId, message, imageUrl, senderName };
  if (ioRef && conversationId) ioRef.to(`conversation:${String(conversationId)}`).emit("message:new", payload);
  emitToUser(senderId, "message:new", payload);
  emitToUser(receiverId, "message:new", payload);
};

/** True if the user currently has at least one connected socket. */
export const isUserOnline = (userId) =>
  userId ? onlineSockets.has(String(userId)) : false;
