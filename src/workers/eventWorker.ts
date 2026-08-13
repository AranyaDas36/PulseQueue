import { Worker, type Job as BullJob } from "bullmq";
import type { EventJobData } from "../queue/eventQueue.js";
import prisma from "../db/prisma.js";
import { redisConnection } from "../redis/redis.js";
import { AIService } from "../services/aiService.js";
import { CacheService } from "../services/cacheService.js";
import { emitEvent } from "../socket/socket.js";
import { logger } from "../utils/logger.js";

const MAX_JOB_ATTEMPTS = 3;

export const worker = new Worker<EventJobData>(
  "ticket-events",
  async (bullJob: BullJob<EventJobData>) => {
    const { eventId, ticketId, payload } = bullJob.data;
    const workerType = bullJob.name;
    const payloadObj = payload as Record<string, any>;
    const dbJobId = payloadObj?.jobId;

    logger.info(
      { jobId: bullJob.id, dbJobId, workerType, attempt: bullJob.attemptsMade + 1 },
      "Processing queue job"
    );

    // 1. Update Job status to IN_PROGRESS in DB
    if (dbJobId) {
      await prisma.job.update({
        where: { id: dbJobId },
        data: {
          status: "IN_PROGRESS",
          attempts: bullJob.attemptsMade + 1,
          history: {
            create: { status: "IN_PROGRESS" },
          },
        },
      }).catch((err) => logger.warn({ err }, "Could not update Job to IN_PROGRESS"));
    }

    await prisma.event.update({
      where: { id: eventId },
      data: { status: "IN_PROGRESS" },
    }).catch((err) => logger.warn({ err }, "Could not update Event to IN_PROGRESS"));

    emitEvent("job:active", {
      bullJobId: bullJob.id,
      dbJobId,
      workerType,
      eventId,
      ticketId,
      attempt: bullJob.attemptsMade + 1,
    });

    try {
      // 2. Execute Worker Logic based on workerType
      if (workerType === "AI_ENRICHMENT") {
        const title = payloadObj.title || "Support Request";
        const description = payloadObj.description || "";

        logger.info({ ticketId }, "Executing AI Ticket Enrichment worker");
        const aiResult = await AIService.enrichTicket(title, description);

        if (ticketId) {
          await prisma.ticket.update({
            where: { id: ticketId },
            data: {
              summary: aiResult.summary,
              priority: aiResult.priority,
              tags: aiResult.tags,
              status: "OPEN",
            },
          });
          // Invalidate ticket cache in Redis
          await CacheService.del(`ticket:${ticketId}`);
        }
      } else if (workerType === "NOTIFICATION") {
        logger.info({ ticketId }, "Simulating Notification Delivery worker");
        // Simulate minor network I/O
        await new Promise((resolve) => setTimeout(resolve, 300));
        emitEvent("notification:sent", {
          ticketId,
          channel: "WEBSOCKET_EMAIL_SIMULATOR",
          message: `Notification dispatched for ticket ${ticketId}`,
        });
      } else if (workerType === "ANALYTICS") {
        logger.info({ eventId }, "Recording Analytics metrics worker");
        await new Promise((resolve) => setTimeout(resolve, 200));
      } else {
        logger.info({ workerType, eventId }, "Executing generic event worker");
      }

      // 3. Mark Job as COMPLETED in DB
      if (dbJobId) {
        await prisma.job.update({
          where: { id: dbJobId },
          data: {
            status: "COMPLETED",
            history: {
              create: { status: "COMPLETED" },
            },
          },
        });
      }

      // Check if all jobs for event are completed
      const pendingJobsCount = await prisma.job.count({
        where: {
          eventId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      });

      if (pendingJobsCount === 0) {
        await prisma.event.update({
          where: { id: eventId },
          data: { status: "COMPLETED" },
        });
      }

      logger.info({ jobId: bullJob.id, workerType }, "Job completed successfully");
      emitEvent("job:completed", {
        bullJobId: bullJob.id,
        dbJobId,
        workerType,
        eventId,
        ticketId,
      });
    } catch (err: any) {
      const errorMessage = err?.message || "Unknown worker error";
      logger.error(
        { jobId: bullJob.id, workerType, attemptsMade: bullJob.attemptsMade + 1, err },
        "Worker execution failed"
      );

      const isFinalAttempt = bullJob.attemptsMade + 1 >= MAX_JOB_ATTEMPTS;

      if (dbJobId) {
        if (isFinalAttempt) {
          // Dead Letter Queue Strategy: Record in FailedJob and mark DEAD
          await prisma.$transaction([
            prisma.job.update({
              where: { id: dbJobId },
              data: {
                status: "DEAD",
                history: {
                  create: { status: "DEAD" },
                },
              },
            }),
            prisma.failedJob.upsert({
              where: { jobId: dbJobId },
              create: {
                jobId: dbJobId,
                reason: errorMessage,
              },
              update: {
                reason: errorMessage,
                failedAt: new Date(),
              },
            }),
            prisma.event.update({
              where: { id: eventId },
              data: { status: "FAILED" },
            }),
          ]);

          emitEvent("dlq:job_dead", {
            dbJobId,
            eventId,
            ticketId,
            reason: errorMessage,
          });
        } else {
          await prisma.job.update({
            where: { id: dbJobId },
            data: {
              status: "FAILED",
              history: {
                create: { status: "FAILED" },
              },
            },
          });
        }
      }

      emitEvent("job:failed", {
        bullJobId: bullJob.id,
        dbJobId,
        workerType,
        eventId,
        attempt: bullJob.attemptsMade + 1,
        isFinalAttempt,
        error: errorMessage,
      });

      throw err; // Allow BullMQ to handle exponential backoff retries if attempts remain
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "BullMQ queue event: job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "BullMQ queue event: job failed");
});

export default worker;
