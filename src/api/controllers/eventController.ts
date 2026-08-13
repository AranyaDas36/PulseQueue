import type { Request, Response } from "express";
import { EventService } from "../../services/eventService.js";
import { logger } from "../../utils/logger.js";

export class EventController {
  async createEvent(req: Request, res: Response) {
    try {
      const { eventType, payload } = req.body;
      const event = await EventService.createEvent(eventType, payload);
      return res.status(202).json({
        message: "Event received and queued for processing",
        event,
      });
    } catch (error: any) {
      logger.error({ error }, "Failed to create event");
      return res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
  }

  async getEventById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const event = await EventService.getEventById(id);
      if (!event) {
        return res.status(404).json({ error: "Not Found", message: "Event not found" });
      }
      return res.status(200).json({ event });
    } catch (error: any) {
      logger.error({ error }, "Failed to fetch event");
      return res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
  }
}
