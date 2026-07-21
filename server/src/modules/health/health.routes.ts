import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      service: "KitchenOS API",
      status: "ok",
      database: "connected",
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
