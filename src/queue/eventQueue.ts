import { Queue } from "bullmq";
import { redisConnection } from "../redis/redis.js";

export interface EventJobData {
  eventId: string;
  eventType: string;
  ticketId?: string | undefined;
  payload: unknown;
  idempotencyKey?: string | undefined;
}

export const eventQueue = new Queue<EventJobData>("ticket-events", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000, // 1s, 2s, 4s
    },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: false,
  },
});

export async function addEventJob(jobName: string, jobData: EventJobData) {
  return await eventQueue.add(jobName, jobData);
}
