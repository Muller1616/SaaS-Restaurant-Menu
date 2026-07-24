import type { Options, Store } from "express-rate-limit";
import rateLimit from "express-rate-limit";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

type IncrementResult = {
  totalHits: number;
  resetTime: Date | undefined;
};

/**
 * Minimal Redis store for express-rate-limit (shared across instances).
 * Falls back to the default memory store when REDIS_URL is unset (local dev).
 */
class RedisRateLimitStore implements Store {
  prefix: string;
  private client: Redis;
  private windowMs = 60_000;

  constructor(client: Redis, prefix: string) {
    this.client = client;
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(key: string) {
    return `${this.prefix}${key}`;
  }

  async increment(key: string): Promise<IncrementResult> {
    const redisKey = this.key(key);
    const hits = await this.client.incr(redisKey);
    if (hits === 1) {
      await this.client.pexpire(redisKey, this.windowMs);
    }
    const ttl = await this.client.pttl(redisKey);
    const resetTime =
      ttl > 0 ? new Date(Date.now() + ttl) : new Date(Date.now() + this.windowMs);
    return { totalHits: hits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const redisKey = this.key(key);
    const value = await this.client.decr(redisKey);
    if (value <= 0) await this.client.del(redisKey);
  }

  async resetKey(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }
}

let sharedRedis: Redis | null = null;

function getRateLimitRedis(): Redis | null {
  if (!env.redisUrl) return null;
  if (sharedRedis) return sharedRedis;
  try {
    sharedRedis = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    sharedRedis.on("error", (err: Error) => {
      logger.warn("Rate-limit Redis error", { error: err.message });
    });
    return sharedRedis;
  } catch (error) {
    logger.warn("Rate-limit Redis unavailable — using memory store", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export type CreateLimiterOptions = {
  windowMs: number;
  max: number;
  message: string;
  skipSuccessfulRequests?: boolean;
  prefix?: string;
};

export function createRateLimiter(options: CreateLimiterOptions) {
  const redis = getRateLimitRedis();
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    message: {
      success: false,
      message: options.message,
    },
    ...(redis
      ? {
          store: new RedisRateLimitStore(
            redis,
            `rl:${options.prefix ?? "default"}:`,
          ),
        }
      : {}),
  });
}

export function createAuthLimiter(message: string, max: number) {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max,
    message,
    skipSuccessfulRequests: true,
    prefix: "auth",
  });
}
