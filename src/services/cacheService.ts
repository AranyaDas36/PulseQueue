import { redisConnection } from "../redis/redis.js";
import { logger } from "../utils/logger.js";

const DEFAULT_TTL = 300; // 5 minutes in seconds

export class CacheService {
  static async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redisConnection.get(key);
      if (data) {
        logger.info({ key }, "Redis cache HIT");
        return JSON.parse(data) as T;
      }
      logger.info({ key }, "Redis cache MISS");
      return null;
    } catch (error) {
      logger.error({ error, key }, "Redis GET error");
      return null;
    }
  }

  static async set(key: string, value: unknown, ttlSeconds = DEFAULT_TTL): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await redisConnection.setex(key, ttlSeconds, serialized);
      logger.info({ key, ttlSeconds }, "Redis cache SET");
    } catch (error) {
      logger.error({ error, key }, "Redis SET error");
    }
  }

  static async del(key: string): Promise<void> {
    try {
      await redisConnection.del(key);
      logger.info({ key }, "Redis cache INVALIDATE");
    } catch (error) {
      logger.error({ error, key }, "Redis DEL error");
    }
  }

  static async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redisConnection.keys(pattern);
      if (keys.length > 0) {
        await redisConnection.del(...keys);
        logger.info({ pattern, count: keys.length }, "Redis pattern cache INVALIDATE");
      }
    } catch (error) {
      logger.error({ error, pattern }, "Redis delPattern error");
    }
  }
}
