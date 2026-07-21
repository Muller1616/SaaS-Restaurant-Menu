import { createApp } from "./app.js";
import { env } from "./config/env.js";
import {
  startSubscriptionAlertScheduler,
  stopSubscriptionAlertScheduler,
} from "./jobs/scheduler.js";
import { prisma } from "./lib/prisma.js";

async function bootstrap() {
  await prisma.$connect();

  const app = createApp();

  const server = app.listen(env.port, () => {
    console.log(`KitchenOS API listening on http://localhost:${env.port}`);
    console.log(`Health check: http://localhost:${env.port}/api/v1/health`);
    startSubscriptionAlertScheduler();
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down…`);
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
  console.error("Failed to start server:", error);
  process.exit(1);
});
