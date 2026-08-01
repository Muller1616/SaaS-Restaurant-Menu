import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { purgeExpiredCancelledSubscriptions } from "../modules/subscriptions/subscription.service.js";
import {
  runDatabaseBackup,
  shouldRunAutomaticBackup,
} from "./database-backup.js";
import { runSubscriptionAlertJob } from "./subscription-alerts.js";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startSubscriptionAlertScheduler() {
  const minutes = env.subscriptionAlertsIntervalMinutes;
  const intervalMs = Math.max(1, minutes) * 60_000;

  if (timer) clearInterval(timer);

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const alerts = await runSubscriptionAlertJob();
      if (alerts.nearExpirySent > 0 || alerts.expiredSent > 0) {
        logger.info("Subscription alerts sent", alerts);
      }

      const retention = await purgeExpiredCancelledSubscriptions();
      if (retention.purged > 0) {
        logger.info("Subscription retention purge", retention);
      }

      if (env.enableLocalDbBackup && (await shouldRunAutomaticBackup())) {
        try {
          const backup = await runDatabaseBackup();
          logger.info("Database backup complete", {
            fileName: backup.fileName,
            sizeBytes: backup.sizeBytes,
            method: backup.method,
            pruned: backup.pruned,
          });
        } catch (backupError) {
          // Managed/remote Postgres often has no local Docker pg_dump — don't fail alert jobs.
          logger.warn("Automatic database backup skipped", {
            error:
              backupError instanceof Error
                ? backupError.message
                : String(backupError),
          });
        }
      }
    } catch (error) {
      logger.warn("Subscription jobs failed", { error: String(error) });
    } finally {
      running = false;
    }
  };

  void tick();
  timer = setInterval(() => void tick(), intervalMs);

  logger.info("Subscription job scheduler started", {
    intervalMinutes: minutes,
    backupIntervalHours: env.backupIntervalHours,
  });
}

export function stopSubscriptionAlertScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
