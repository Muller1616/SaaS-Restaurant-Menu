import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Log a redacted DB host so misconfigured remote URLs are obvious in local logs. */
export function logDatabaseTarget() {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const parsed = new URL(url);
    logger.info("Prisma database target", {
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\//, "").split("?")[0],
      local:
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "::1",
    });
    if (
      process.env.NODE_ENV === "development" &&
      parsed.hostname.includes("render.com")
    ) {
      logger.warn(
        "DATABASE_URL points at a remote Render Postgres from a local process — high latency commonly causes 500s on dashboard stats and approval transactions. Prefer docker compose Postgres for local development.",
      );
    }
  } catch {
    logger.warn("DATABASE_URL could not be parsed for diagnostics");
  }
}
