import type { Request, Response } from "express";
import { EventService } from "../../services/eventService.js";
import prisma from "../../db/prisma.js";
import { redisConnection } from "../../redis/redis.js";
import { logger } from "../../utils/logger.js";

export class MetricsController {
  async getMetricsSummary(_req: Request, res: Response) {
    try {
      const summary = await EventService.getMetricsSummary();
      return res.status(200).json(summary);
    } catch (error: any) {
      logger.error({ error }, "Failed to fetch metrics summary");
      return res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
  }

  async getHealth(_req: Request, res: Response) {
    try {
      let dbHealthy = false;
      let redisHealthy = false;

      try {
        await prisma.$queryRaw`SELECT 1`;
        dbHealthy = true;
      } catch (err) {
        logger.error({ err }, "Health check DB ping failed");
      }

      try {
        const pingRes = await redisConnection.ping();
        redisHealthy = pingRes === "PONG";
      } catch (err) {
        logger.error({ err }, "Health check Redis ping failed");
      }

      const status = dbHealthy && redisHealthy ? 200 : 503;
      return res.status(status).json({
        status: dbHealthy && redisHealthy ? "healthy" : "unhealthy",
        uptime: process.uptime(),
        timestamp: new Date(),
        checks: {
          database: dbHealthy ? "up" : "down",
          redis: redisHealthy ? "up" : "down",
        },
      });
    } catch (error: any) {
      return res.status(500).json({ status: "error", message: error.message });
    }
  }
}
