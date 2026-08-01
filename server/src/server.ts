import { createApp } from "./app.js";
import { env } from "./config/env.js";
import {
  startSubscriptionAlertScheduler,
  stopSubscriptionAlertScheduler,
} from "./jobs/scheduler.js";
import { initCache } from "./lib/cache/index.js";
import { logger } from "./lib/logger.js";
import { logDatabaseTarget, prisma } from "./lib/prisma.js";
import { verifySmtpConnection } from "./services/email.js";

type PassengerGlobal = {
  configure: (options: { autoInstall: boolean }) => void;
};

function getPassenger(): PassengerGlobal | null {
  const g = globalThis as typeof globalThis & {
    PhusionPassenger?: PassengerGlobal;
  };
  return g.PhusionPassenger ?? null;
}

async function bootstrap() {
  const passenger = getPassenger();
  if (passenger) {
    passenger.configure({ autoInstall: false });
  }

  logDatabaseTarget();
  await prisma.$connect();
  await initCache();
  // Non-blocking: warn early if SMTP is misconfigured.
  void verifySmtpConnection();

  const app = createApp();
  const listenTarget = passenger ? "passenger" : env.port;

  const server = app.listen(listenTarget, () => {
    logger.info("KitchenOS API listening", {
      port: passenger ? "passenger" : env.port,
      env: env.nodeEnv,
      serveClient: env.serveClient,
    });
    startSubscriptionAlertScheduler();
  });

  const shutdown = async (signal: string) => {
    logger.info("Shutting down", { signal });
    stopSubscriptionAlertScheduler();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", reason);
  });
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", error);
    void shutdown("uncaughtException");
  });
}

bootstrap().catch((error) => {
  logger.error("Failed to start server", error);
  process.exit(1);
});
