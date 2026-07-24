import { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { logger } from "../logger.js";

type CacheStats = {
  hits: number;
  misses: number;
  errors: number;
  sets: number;
  deletes: number;
  backend: "redis" | "memory" | "disabled";
  connected: boolean;
};

const stats: CacheStats = {
  hits: 0,
  misses: 0,
  errors: 0,
  sets: 0,
  deletes: 0,
  backend: "disabled",
  connected: false,
};

type MemoryEntry = { value: string; expiresAt: number };
const memoryStore = new Map<string, MemoryEntry>();

let redis: Redis | null = null;
let redisReady = false;

function requiresDistributedCache() {
  return Boolean(env.redisUrl);
}

/**
 * Redis is required in production (see env.ts). Locally, omitting REDIS_URL
 * uses process-local memory suitable for a single API process.
 */
export async function initCache() {
  const url = env.redisUrl;
  if (!url) {
    if (env.isProduction) {
      throw new Error("REDIS_URL is required in production");
    }
    stats.backend = "memory";
    stats.connected = true;
    logger.info("Cache: in-memory fallback (set REDIS_URL for distributed cache)");
    return;
  }

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 5_000,
    });
    redis = client;

    client.on("error", (err: Error) => {
      redisReady = false;
      stats.connected = false;
      logger.warn("Redis cache error", { error: err.message });
    });
    client.on("ready", () => {
      redisReady = true;
      stats.connected = true;
      stats.backend = "redis";
      logger.info("Redis cache connected");
    });
    client.on("close", () => {
      redisReady = false;
      stats.connected = false;
    });

    await client.connect();
    redisReady = true;
    stats.backend = "redis";
    stats.connected = true;
  } catch (error) {
    redis = null;
    redisReady = false;
    stats.connected = false;
    if (env.isProduction) {
      throw new Error(
        `Redis unavailable in production: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    stats.backend = "memory";
    stats.connected = true;
    logger.warn("Redis unavailable — using in-memory cache", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function assertInvalidationReady() {
  if (!requiresDistributedCache()) return;
  if (!redis || !redisReady) {
    throw new Error(
      "Cache invalidation unavailable — Redis is not connected. Retry shortly.",
    );
  }
}

function memoryGet(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key: string, value: string, ttlSeconds: number) {
  memoryStore.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  if (memoryStore.size > 5_000) {
    const first = memoryStore.keys().next().value;
    if (first) memoryStore.delete(first);
  }
}

function memoryDel(patternOrKey: string) {
  if (!patternOrKey.includes("*")) {
    memoryStore.delete(patternOrKey);
    return 1;
  }
  const prefix = patternOrKey.replace(/\*$/, "");
  let n = 0;
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix)) {
      memoryStore.delete(key);
      n += 1;
    }
  }
  return n;
}

/** Fail-open on read — miss falls through to DB. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (redis && redisReady) {
      const raw = await redis.get(key);
      if (raw == null) {
        stats.misses += 1;
        return null;
      }
      stats.hits += 1;
      return JSON.parse(raw) as T;
    }

    const raw = memoryGet(key);
    if (raw == null) {
      stats.misses += 1;
      return null;
    }
    stats.hits += 1;
    return JSON.parse(raw) as T;
  } catch (error) {
    stats.errors += 1;
    logger.warn("cacheGet failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Fail-open on write — missing cache is safe. */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    if (redis && redisReady) {
      await redis.set(key, raw, "EX", ttlSeconds);
      stats.sets += 1;
      return;
    }
    if (requiresDistributedCache()) {
      // Redis configured but not ready — skip write rather than split-brain memory.
      return;
    }
    memorySet(key, raw, ttlSeconds);
    stats.sets += 1;
  } catch (error) {
    stats.errors += 1;
    logger.warn("cacheSet failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Fail-closed when Redis is configured: mutations must not leave stale public data.
 * Local memory mode (no REDIS_URL) deletes in-process only.
 */
export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  assertInvalidationReady();
  try {
    if (redis && redisReady) {
      await redis.del(...keys);
      stats.deletes += keys.length;
      return;
    }
    for (const key of keys) memoryDel(key);
    stats.deletes += keys.length;
  } catch (error) {
    stats.errors += 1;
    logger.error("cacheDel failed", error, { keys });
    throw error;
  }
}

/** Delete by prefix using SCAN (Redis) or memory prefix match. Fail-closed with Redis. */
export async function cacheDelByPrefix(prefix: string): Promise<number> {
  assertInvalidationReady();
  try {
    if (redis && redisReady) {
      let cursor = "0";
      let deleted = 0;
      do {
        const [next, keys] = await redis.scan(
          cursor,
          "MATCH",
          `${prefix}*`,
          "COUNT",
          100,
        );
        cursor = next;
        if (keys.length > 0) {
          deleted += await redis.del(...keys);
        }
      } while (cursor !== "0");
      stats.deletes += deleted;
      return deleted;
    }
    const n = memoryDel(`${prefix}*`);
    stats.deletes += n;
    return n;
  } catch (error) {
    stats.errors += 1;
    logger.error("cacheDelByPrefix failed", error, { prefix });
    throw error;
  }
}

export async function cacheAside<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;
  const fresh = await loader();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}

export function getCacheStats() {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    hitRatio: total === 0 ? null : Number((stats.hits / total).toFixed(4)),
    memoryKeys: memoryStore.size,
  };
}

export function resetCacheStats() {
  stats.hits = 0;
  stats.misses = 0;
  stats.errors = 0;
  stats.sets = 0;
  stats.deletes = 0;
}
