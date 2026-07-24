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

function assertHttpsOrigin(name: string, value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${name} must use https in production (got ${value})`);
  }
  if (
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname.endsWith(".local")
  ) {
    throw new Error(`${name} must be a public origin in production`);
  }
}

function assertProductionDatabaseUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }
  if (
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1"
  ) {
    throw new Error(
      "DATABASE_URL must not point at localhost in production",
    );
  }
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
  const hasSslFlag =
    sslMode === "require" ||
    sslMode === "verify-full" ||
    sslMode === "verify-ca" ||
    /[?&]ssl(?:mode)?=/i.test(url) ||
    url.includes("ssl=true");
  if (!hasSslFlag) {
    throw new Error(
      "DATABASE_URL must enable TLS in production (e.g. sslmode=require)",
    );
  }
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
if (isProduction) {
  assertHttpsOrigin("CLIENT_URL", clientUrl);
  assertHttpsOrigin("PUBLIC_APP_URL", publicAppUrl);
}

const smtpHost = process.env.SMTP_HOST ?? "localhost";
const smtpUser = process.env.SMTP_USER ?? "";
const smtpPass = process.env.SMTP_PASS ?? "";
const smtpFrom =
  process.env.SMTP_FROM ?? "KitchenOS <noreply@kitchenos.local>";
if (isProduction) {
  if (smtpHost === "localhost" || smtpHost === "127.0.0.1") {
    throw new Error("SMTP_HOST must be a real mail provider in production");
  }
  if (!smtpUser.trim() || !smtpPass.trim()) {
    throw new Error("SMTP_USER and SMTP_PASS are required in production");
  }
  if (
    !smtpFrom.trim() ||
    smtpFrom.includes("kitchenos.local") ||
    smtpFrom.includes("example.com")
  ) {
    throw new Error(
      "SMTP_FROM must be a real sender address in production",
    );
  }
}

/** Public origin of this API (for absolute /uploads URLs in JSON). */
const publicApiUrl = (process.env.PUBLIC_API_URL ?? "").replace(/\/$/, "");
if (isProduction) {
  if (!publicApiUrl) {
    throw new Error(
      "PUBLIC_API_URL is required in production (absolute HTTPS API origin for media URLs)",
    );
  }
  assertHttpsOrigin("PUBLIC_API_URL", publicApiUrl);
}

const databaseUrl = required("DATABASE_URL");
if (isProduction) {
  assertProductionDatabaseUrl(databaseUrl);
}

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl,
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
    user: smtpUser,
    pass: smtpPass,
    from: smtpFrom,
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
   * Minimum length for newly created / changed passwords (floor 8).
   */
  passwordMinLength: (() => {
    const n = Number(process.env.PASSWORD_MIN_LENGTH ?? 8);
    if (!Number.isFinite(n) || n < 8) return 8;
    return Math.floor(n);
  })(),
  /**
   * Redis URL for distributed response caching + rate limits.
   * Required in production (multi-instance safe).
   * Optional locally — falls back to process memory.
   */
  redisUrl: (() => {
    const url = (process.env.REDIS_URL ?? "").trim() || null;
    if (isProduction && !url) {
      throw new Error("REDIS_URL is required in production for shared cache");
    }
    return url;
  })(),
} as const;
