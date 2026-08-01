import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Always load server/.env (cPanel app root may be the monorepo, not server/).
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config(); // optional override from process cwd

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
  const allowInsecureDb =
    (process.env.ALLOW_INSECURE_DB ?? "").trim().toLowerCase() === "1" ||
    (process.env.ALLOW_INSECURE_DB ?? "").trim().toLowerCase() === "true";
  if (allowInsecureDb) {
    return;
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
      "DATABASE_URL must enable TLS in production (e.g. sslmode=require). Set ALLOW_INSECURE_DB=1 only for private cPanel Postgres without TLS.",
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

const clientUrl = (
  process.env.CLIENT_URL ?? (isProduction ? "" : "http://localhost:5173")
).replace(/\/$/, "");
const publicAppUrl = (
  process.env.PUBLIC_APP_URL ?? (isProduction ? "" : "http://localhost:5173")
).replace(/\/$/, "");
if (isProduction) {
  if (!clientUrl) {
    throw new Error(
      "CLIENT_URL is required in production (e.g. https://myqrmenu.yourdomain.com)",
    );
  }
  if (!publicAppUrl) {
    throw new Error(
      "PUBLIC_APP_URL is required in production (usually the same as CLIENT_URL)",
    );
  }
  assertHttpsOrigin("CLIENT_URL", clientUrl);
  assertHttpsOrigin("PUBLIC_APP_URL", publicAppUrl);
}

const smtpHost = process.env.SMTP_HOST ?? "localhost";
const smtpPort = Number(process.env.SMTP_PORT ?? 1025);
const smtpUser = process.env.SMTP_USER ?? "";
const smtpPass = process.env.SMTP_PASS ?? "";
const smtpFrom =
  process.env.SMTP_FROM ?? "KitchenOS <noreply@kitchenos.local>";
/** Explicit override; otherwise port 465 ⇒ implicit TLS, else STARTTLS. */
const smtpSecureEnv = (process.env.SMTP_SECURE ?? "").trim().toLowerCase();
const smtpSecure =
  smtpSecureEnv === "true" || smtpSecureEnv === "1"
    ? true
    : smtpSecureEnv === "false" || smtpSecureEnv === "0"
      ? false
      : smtpPort === 465;
const smtpTimeoutMs = (() => {
  const n = Number(process.env.SMTP_TIMEOUT_MS ?? 20_000);
  if (!Number.isFinite(n) || n < 3_000) return 20_000;
  return Math.min(Math.floor(n), 60_000);
})();

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
    throw new Error("SMTP_FROM must be a real sender address in production");
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

const cloudinaryCloudName = (process.env.CLOUDINARY_CLOUD_NAME ?? "").trim();
const cloudinaryApiKey = (process.env.CLOUDINARY_API_KEY ?? "").trim();
const cloudinaryApiSecret = (process.env.CLOUDINARY_API_SECRET ?? "").trim();
if (isProduction) {
  if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
    throw new Error(
      "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required in production",
    );
  }
}

/** Same-origin deploy when API and SPA share one HTTPS origin (typical cPanel). */
const sameOriginDeploy = (() => {
  if (!publicApiUrl) return false;
  try {
    return new URL(clientUrl).origin === new URL(publicApiUrl).origin;
  } catch {
    return false;
  }
})();

const serveClient = (() => {
  const raw = (process.env.SERVE_CLIENT ?? "").trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  // Default on in production when SPA and API share the same origin.
  return isProduction && sameOriginDeploy;
})();

const clientDistPath = path.resolve(
  process.env.CLIENT_DIST_PATH?.trim() ||
    path.join(__dirname, "../../../client/dist"),
);

const allowInMemoryCache = (() => {
  const raw = (process.env.ALLOW_INMEMORY_CACHE ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true";
})();

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
  sameOriginDeploy,
  /** Serve Vite `client/dist` from Express (cPanel single-app). */
  serveClient,
  clientDistPath,
  /** Hours until an approval activation link expires. */
  activationTokenHours: Number(process.env.ACTIVATION_TOKEN_HOURS ?? 24),
  /**
   * Legacy local upload root — kept only for reading old `/uploads/...`
   * paths during migration. New uploads go to Cloudinary.
   */
  uploadDir: path.resolve(
    path.join(__dirname, "../.."),
    process.env.UPLOAD_DIR ?? "uploads",
  ),
  cloudinary: {
    cloudName: cloudinaryCloudName,
    apiKey: cloudinaryApiKey,
    apiSecret: cloudinaryApiSecret,
    /** True when all three Cloudinary credentials are present. */
    enabled: Boolean(
      cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret,
    ),
  },
  smtp: {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    user: smtpUser,
    pass: smtpPass,
    from: smtpFrom,
    /** Max wait for verify/sendMail before failing the HTTP request. */
    timeoutMs: smtpTimeoutMs,
  },
  /**
   * When false, the scheduler skips local pg_dump backups.
   * Default: enabled in development, disabled in production.
   */
  enableLocalDbBackup: (() => {
    const raw = (process.env.ENABLE_LOCAL_DB_BACKUP ?? "").trim().toLowerCase();
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    return !isProduction;
  })(),
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
   * Recommended in production. Optional with ALLOW_INMEMORY_CACHE=1
   * for single-process cPanel hosts (falls back to process memory).
   */
  redisUrl: (() => {
    const url = (process.env.REDIS_URL ?? "").trim() || null;
    if (isProduction && !url && !allowInMemoryCache) {
      throw new Error(
        "REDIS_URL is required in production (or set ALLOW_INMEMORY_CACHE=1 for single-process cPanel)",
      );
    }
    return url;
  })(),
  allowInMemoryCache,
} as const;
