import type { Request, Response } from "express";
import { TicketService } from "../../services/ticketService.js";
import { logger } from "../../utils/logger.js";

export class TicketController {
  async createTicket(req: Request, res: Response) {
    try {
      const result = await TicketService.createTicket(req.body);
      return res.status(202).json({
        message: "Support ticket created and queued for asynchronous processing",
        ticket: result.ticket,
        event: result.event,
        jobsEnqueued: result.jobs.length,
      });
    } catch (error: any) {
      logger.error({ error }, "Failed to create ticket");
      return res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
  }

  async getTicketById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const result = await TicketService.getTicketById(id);
      if (!result.ticket) {
        return res.status(404).json({ error: "Not Found", message: "Ticket not found" });
      }
      return res.status(200).json({
        ticket: result.ticket,
        cached: result.fromCache,
      });
    } catch (error: any) {
      logger.error({ error }, "Failed to fetch ticket");
      return res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
  }

  async listTickets(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as any;
      const priority = req.query.priority as any;

      const result = await TicketService.listTickets(page, limit, status, priority);
      return res.status(200).json(result);
    } catch (error: any) {
      logger.error({ error }, "Failed to list tickets");
      return res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
  }
}
