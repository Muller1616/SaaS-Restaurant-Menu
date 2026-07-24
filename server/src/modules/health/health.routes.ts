import { Router } from "express";
import { env } from "../../config/env.js";
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
      // Keep public health lean — detailed cache metrics are on /cache (non-production or gated).
      cache: {
        backend: cache.backend,
        connected: cache.connected,
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

/** Detailed cache metrics — available in non-production, or with HEALTH_CACHE_TOKEN. */
healthRouter.get("/cache", (req, res) => {
  const token = process.env.HEALTH_CACHE_TOKEN?.trim();
  const allowed =
    !env.isProduction ||
    (Boolean(token) && req.get("x-health-token") === token);

  if (!allowed) {
    res.status(404).json({ success: false, message: "Not found" });
    return;
  }

  const cache = getCacheStats();
  res.json({
    success: true,
    data: cache,
  });
});
