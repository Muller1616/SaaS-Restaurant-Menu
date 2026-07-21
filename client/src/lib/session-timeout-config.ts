/**
 * Idle session timeout configuration.
 * Override via Vite env (milliseconds).
 */
function readPositiveInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Total inactivity before forced logout (default 3 minutes). */
export const SESSION_IDLE_MS = readPositiveInt(
  import.meta.env.VITE_SESSION_IDLE_MS,
  180_000,
);

/** Warning window before logout (default 30 seconds). */
export const SESSION_WARNING_MS = Math.min(
  readPositiveInt(import.meta.env.VITE_SESSION_WARNING_MS, 30_000),
  Math.max(1_000, SESSION_IDLE_MS - 1_000),
);

/** Throttle local activity handling / cross-tab pings. */
export const SESSION_ACTIVITY_THROTTLE_MS = 1_000;

export const SESSION_IDLE_MESSAGE =
  "Your session has expired due to inactivity. Please sign in again to continue.";

export const ADMIN_SESSION_SYNC_CHANNEL = "kitchenos-admin-session";
export const TENANT_SESSION_SYNC_CHANNEL = "kitchenos-tenant-session";
