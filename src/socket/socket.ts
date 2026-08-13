import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "http";
import { logger } from "../utils/logger.js";

let io: SocketIOServer | null = null;

export function initSocketIO(server: HTTPServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Dashboard Socket.IO client connected");

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Dashboard Socket.IO client disconnected");
    });
  });

  return io;
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

export function emitEvent(event: string, data: unknown) {
  if (io) {
    io.emit(event, data);
  }
}
