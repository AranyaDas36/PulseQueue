import type { Request, Response } from "express";
import { EventService } from "../../services/eventService.js";
import { logger } from "../../utils/logger.js";

export class JobController {
  async getFailedJobs(_req: Request, res: Response) {
    try {
      const failedJobs = await EventService.getFailedJobs();
      return res.status(200).json({ failedJobs });
    } catch (error: any) {
      logger.error({ error }, "Failed to fetch dead-letter failed jobs");
      return res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
  }

  async retryFailedJob(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const result = await EventService.retryFailedJob(id);
      return res.status(200).json({
        message: "Failed job re-queued successfully",
        result,
      });
    } catch (error: any) {
      logger.error({ error }, "Failed to retry job");
      return res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
  }
}
