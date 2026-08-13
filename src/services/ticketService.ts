import prisma from "../db/prisma.js";
import { CacheService } from "./cacheService.js";
import { addEventJob } from "../queue/eventQueue.js";
import { emitEvent } from "../socket/socket.js";
import { logger } from "../utils/logger.js";
import type { Priority, TicketStatus } from "../generated/prisma/client.js";

export interface CreateTicketDTO {
  title: string;
  description: string;
  priority?: Priority;
}

export class TicketService {
  static async createTicket(dto: CreateTicketDTO) {
    // 1. Create Event record
    const event = await prisma.event.create({
      data: {
        type: "TICKET_CREATED",
        payload: dto as any,
        status: "PENDING",
      },
    });

    // 2. Create Ticket record linked to Event
    const ticket = await prisma.ticket.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority || null,
        status: "OPEN",
        eventId: event.id,
      },
    });

    // 3. Create Job records in DB for tracking
    const workers = ["AI_ENRICHMENT", "NOTIFICATION", "ANALYTICS"];
    const jobRecords = await Promise.all(
      workers.map((workerName) =>
        prisma.job.create({
          data: {
            eventId: event.id,
            worker: workerName,
            status: "PENDING",
            attempts: 0,
            history: {
              create: {
                status: "PENDING",
              },
            },
          },
        })
      )
    );

    // 4. Enqueue BullMQ jobs for each worker task
    for (const jobRecord of jobRecords) {
      await addEventJob(jobRecord.worker, {
        eventId: event.id,
        eventType: "TICKET_CREATED",
        ticketId: ticket.id,
        payload: {
          jobId: jobRecord.id,
          title: ticket.title,
          description: ticket.description,
        },
      });
    }

    logger.info({ ticketId: ticket.id, eventId: event.id }, "Support ticket created and background jobs enqueued");

    // 5. Emit Socket.IO event for real-time dashboard
    emitEvent("event:created", {
      event,
      ticket,
      jobs: jobRecords,
    });

    return { ticket, event, jobs: jobRecords };
  }

  static async getTicketById(id: string) {
    const cacheKey = `ticket:${id}`;
    
    // Check Redis Cache first (Cache-aside pattern)
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return { ticket: cached, fromCache: true };
    }

    // DB Fallback
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        event: {
          include: {
            jobs: {
              include: {
                failedJob: true,
              },
            },
          },
        },
      },
    });

    if (ticket) {
      // Store in Redis cache for 5 minutes
      await CacheService.set(cacheKey, ticket, 300);
    }

    return { ticket, fromCache: false };
  }

  static async listTickets(page = 1, limit = 20, status?: TicketStatus, priority?: Priority) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          event: {
            select: { id: true, type: true, status: true },
          },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    return {
      tickets,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async updateTicket(id: string, data: Partial<CreateTicketDTO & { summary?: string; priority?: Priority; tags?: any; status?: TicketStatus }>) {
    const updated = await prisma.ticket.update({
      where: { id },
      data,
    });

    // Invalidate Redis cache
    await CacheService.del(`ticket:${id}`);
    
    emitEvent("ticket:updated", updated);

    return updated;
  }
}
