import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  jwtRememberExpiresIn: process.env.JWT_REMEMBER_EXPIRES_IN ?? "30d",
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "http://localhost:5173",
  uploadDir: path.resolve(
    path.join(__dirname, "../.."),
    process.env.UPLOAD_DIR ?? "uploads",
  ),
  smtp: {
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 1025),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "KitchenOS <noreply@kitchenos.local>",
  },
  /** How often FR-8.1 subscription alert job runs (minutes). */
  subscriptionAlertsIntervalMinutes: Number(
    process.env.SUBSCRIPTION_ALERTS_INTERVAL_MINUTES ?? 60,
  ),
  /** Local directory for §6.3 pg_dump backups. */
  backupDir: path.resolve(
    path.join(__dirname, "../.."),
    process.env.BACKUP_DIR ?? "backups",
  ),
  /** Keep backups newer than this many days. */
  backupRetainDays: Number(process.env.BACKUP_RETAIN_DAYS ?? 14),
  /** Minimum hours between automatic backups (scheduler). */
  backupIntervalHours: Number(process.env.BACKUP_INTERVAL_HOURS ?? 24),
} as const;
