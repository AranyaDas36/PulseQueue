import "dotenv/config";
import http from "http";
import app from "./app.js";
import { initSocketIO } from "./socket/socket.js";
import { logger } from "./utils/logger.js";
import prisma from "./db/prisma.js";
import { redisConnection } from "./redis/redis.js";

const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer(app);

// Initialize Socket.IO server for real-time monitoring
initSocketIO(server);

server.listen(PORT, () => {
  logger.info({ port: PORT }, `PulseQueue Backend Server listening on port ${PORT}`);
});

// Graceful Shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, "Received shutdown signal. Closing server...");
  server.close(async () => {
    logger.info("HTTP server closed.");
    try {
      await prisma.$disconnect();
      await redisConnection.quit();
      logger.info("Database and Redis connections closed gracefully.");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during graceful shutdown");
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
