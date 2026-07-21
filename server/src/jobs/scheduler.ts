import { env } from "../config/env.js";
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
        console.log("[subscription-alerts]", alerts);
      }

      const retention = await purgeExpiredCancelledSubscriptions();
      if (retention.purged > 0) {
        console.log("[subscription-retention]", retention);
      }

      if (await shouldRunAutomaticBackup()) {
        const backup = await runDatabaseBackup();
        console.log("[db-backup]", {
          fileName: backup.fileName,
          sizeBytes: backup.sizeBytes,
          method: backup.method,
          pruned: backup.pruned,
        });
      }
    } catch (error) {
      console.warn("[subscription-jobs] failed:", error);
    } finally {
      running = false;
    }
  };

  void tick();
  timer = setInterval(() => void tick(), intervalMs);

  console.log(
    `[subscription-jobs] scheduler started (every ${minutes} minute(s); backups every ${env.backupIntervalHours}h)`,
  );
}

export function stopSubscriptionAlertScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
