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

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";

const jwtSecret = required("JWT_SECRET");
if (isProduction && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}
if (
  isProduction &&
  (jwtSecret.includes("dev-") || jwtSecret.includes("change-me"))
) {
  throw new Error("JWT_SECRET must not use a development placeholder in production");
}

const clientUrl = (process.env.CLIENT_URL ?? "http://localhost:5173").replace(
  /\/$/,
  "",
);
const publicAppUrl = (
  process.env.PUBLIC_APP_URL ?? "http://localhost:5173"
).replace(/\/$/, "");
if (
  isProduction &&
  (clientUrl.includes("localhost") || publicAppUrl.includes("localhost"))
) {
  throw new Error(
    "CLIENT_URL and PUBLIC_APP_URL must be public HTTPS origins in production",
  );
}

const smtpHost = process.env.SMTP_HOST ?? "localhost";
if (isProduction && (smtpHost === "localhost" || smtpHost === "127.0.0.1")) {
  throw new Error("SMTP_HOST must be a real mail provider in production");
}

/** Public origin of this API (for absolute /uploads URLs in JSON). */
const publicApiUrl = (process.env.PUBLIC_API_URL ?? "").replace(/\/$/, "");

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  jwtRememberExpiresIn: process.env.JWT_REMEMBER_EXPIRES_IN ?? "30d",
  clientUrl,
  publicAppUrl,
  publicApiUrl,
  /** Hours until an approval activation link expires. */
  activationTokenHours: Number(process.env.ACTIVATION_TOKEN_HOURS ?? 24),
  uploadDir: path.resolve(
    path.join(__dirname, "../.."),
    process.env.UPLOAD_DIR ?? "uploads",
  ),
  smtp: {
    host: smtpHost,
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
  backupDockerContainer:
    process.env.BACKUP_DOCKER_CONTAINER ?? "kitchenos-postgres",
  backupPgUser: process.env.BACKUP_PGUSER ?? "kitchenos",
  backupPgDatabase: process.env.BACKUP_PGDATABASE ?? "kitchenos",
  /**
   * Optional Redis URL for distributed response caching.
   * When unset, the API uses process-local memory cache (single instance).
   */
  redisUrl: (process.env.REDIS_URL ?? "").trim() || null,
} as const;
