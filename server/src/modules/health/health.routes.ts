import { Router } from "express";
import { getCacheStats } from "../../lib/cache/index.js";
import { prisma } from "../../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const cache = getCacheStats();
    res.json({
      success: true,
      service: "KitchenOS API",
      status: "ok",
      database: "connected",
      cache: {
        backend: cache.backend,
        connected: cache.connected,
        hits: cache.hits,
        misses: cache.misses,
        hitRatio: cache.hitRatio,
        errors: cache.errors,
        sets: cache.sets,
        deletes: cache.deletes,
        memoryKeys: cache.memoryKeys,
      },
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      success: false,
      service: "KitchenOS API",
      status: "degraded",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});

/** Dedicated cache metrics (same stats as /health.cache). */
healthRouter.get("/cache", (_req, res) => {
  const cache = getCacheStats();
  res.json({
    success: true,
    data: cache,
  });
});
