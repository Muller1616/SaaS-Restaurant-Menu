import { createApp } from "./app.js";
import { env } from "./config/env.js";
import {
  startSubscriptionAlertScheduler,
  stopSubscriptionAlertScheduler,
} from "./jobs/scheduler.js";
import { initCache } from "./lib/cache/index.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

async function bootstrap() {
  await prisma.$connect();
  await initCache();

  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info("KitchenOS API listening", {
      port: env.port,
      env: env.nodeEnv,
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
}

bootstrap().catch((error) => {
  logger.error("Failed to start server", error);
  process.exit(1);
});
