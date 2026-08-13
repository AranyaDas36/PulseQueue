import prisma from "../db/prisma.js";
import type { Prisma, TicketStatus } from "../generated/prisma/client.js";
import { addEventJob } from "../queue/eventQueue.js";
import { emitEvent } from "../socket/socket.js";
import { logger } from "../utils/logger.js";

export class EventService {
    static async createEvent(eventType: string, payload: Prisma.InputJsonValue) {
        try {
            const event = await prisma.event.create({
                data: {
                    type: eventType,
                    payload: payload,
                    status: "PENDING",
                },
            });

            const jobRecord = await prisma.job.create({
                data: {
                    eventId: event.id,
                    worker: "GENERIC_WORKER",
                    status: "PENDING",
                    attempts: 0,
                    history: {
                        create: {
                            status: "PENDING",
                        },
                    },
                },
            });

            await addEventJob("GENERIC_WORKER", {
                eventId: event.id,
                eventType: event.type,
                payload: {
                    jobId: jobRecord.id,
                    payload: event.payload,
                },
            });

            emitEvent("event:created", { event, jobs: [jobRecord] });
            return event;
        } catch (err) {
            logger.error({ err }, "Error creating generic event");
            throw err;
        }
    }

    static async getEventById(id: string) {
        return await prisma.event.findUnique({
            where: { id },
            include: {
                ticket: true,
                jobs: {
                    include: {
                        history: { orderBy: { timestamp: "asc" } },
                        failedJob: true,
                    },
                },
            },
        });
    }

    static async getFailedJobs() {
        return await prisma.failedJob.findMany({
            orderBy: { failedAt: "desc" },
            include: {
                job: {
                    include: {
                        event: {
                            include: { ticket: true },
                        },
                    },
                },
            },
        });
    }

    static async retryFailedJob(failedJobId: string) {
        const failedJob = await prisma.failedJob.findUnique({
            where: { id: failedJobId },
            include: { job: { include: { event: { include: { ticket: true } } } } },
        });

        if (!failedJob) {
            throw new Error("Failed job record not found");
        }

        const { job } = failedJob;

        // Reset job status to PENDING and delete failedJob record
        await prisma.$transaction([
            prisma.job.update({
                where: { id: job.id },
                data: {
                    status: "PENDING",
                    attempts: 0,
                    history: {
                        create: {
                            status: "PENDING",
                        },
                    },
                },
            }),
            prisma.failedJob.delete({
                where: { id: failedJobId },
            }),
        ]);

        // Re-enqueue job to BullMQ
        await addEventJob(job.worker, {
            eventId: job.eventId,
            eventType: job.event.type,
            ticketId: job.event.ticket?.id ?? undefined,
            payload: {
                jobId: job.id,
                title: job.event.ticket?.title,
                description: job.event.ticket?.description,
                payload: job.event.payload,
            },
        });

        logger.info({ failedJobId, jobId: job.id }, "Failed job successfully re-queued for retry");
        emitEvent("job:retried", { jobId: job.id, worker: job.worker });

        return { success: true, jobId: job.id };
    }

    static async getMetricsSummary() {
        const [
            totalTickets,
            openTickets,
            resolvedTickets,
            totalEvents,
            jobStatusCounts,
            failedJobsCount,
            recentJobs,
        ] = await Promise.all([
            prisma.ticket.count(),
            prisma.ticket.count({ where: { status: "OPEN" as TicketStatus } }),
            prisma.ticket.count({ where: { status: "RESOLVED" as TicketStatus } }),
            prisma.event.count(),
            prisma.job.groupBy({
                by: ["status"],
                _count: { status: true },
            }),
            prisma.failedJob.count(),
            prisma.job.findMany({
                take: 10,
                orderBy: { createdAt: "desc" },
                include: {
                    event: {
                        select: { id: true, type: true, ticket: { select: { title: true } } },
                    },
                },
            }),
        ]);

        const statusCountsMap: Record<string, number> = {
            PENDING: 0,
            IN_PROGRESS: 0,
            COMPLETED: 0,
            FAILED: 0,
            DEAD: 0,
        };

        jobStatusCounts.forEach((group: any) => {
            statusCountsMap[group.status] = group._count.status;
        });

        return {
            totalTickets,
            openTickets,
            resolvedTickets,
            totalEvents,
            failedJobsCount,
            jobs: statusCountsMap,
            recentJobs,
        };
    }
}