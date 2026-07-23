/**
 * Idle session timeout configuration.
 * Override via Vite env (milliseconds).
 */
function readPositiveInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function warningWindow(idleMs: number, warningRaw: number) {
  return Math.min(warningRaw, Math.max(1_000, idleMs - 1_000));
}

/** Tenant inactivity before forced logout (default 3 minutes). */
export const SESSION_IDLE_MS = readPositiveInt(
  import.meta.env.VITE_SESSION_IDLE_MS,
  180_000,
);

/** Tenant warning window before logout (default 30 seconds). */
export const SESSION_WARNING_MS = warningWindow(
  SESSION_IDLE_MS,
  readPositiveInt(import.meta.env.VITE_SESSION_WARNING_MS, 30_000),
);

/**
 * Admin inactivity before forced logout (default 5 minutes).
 * Prefer VITE_ADMIN_SESSION_IDLE_MS; falls back to shared VITE_SESSION_IDLE_MS only
 * when an admin-specific value is unset and the shared default is already ≥ 5m.
 */
export const ADMIN_SESSION_IDLE_MS = readPositiveInt(
  import.meta.env.VITE_ADMIN_SESSION_IDLE_MS,
  300_000,
);

/** Admin warning window before logout (default 30 seconds). */
export const ADMIN_SESSION_WARNING_MS = warningWindow(
  ADMIN_SESSION_IDLE_MS,
  readPositiveInt(
    import.meta.env.VITE_ADMIN_SESSION_WARNING_MS ??
      import.meta.env.VITE_SESSION_WARNING_MS,
    30_000,
  ),
);

/** Throttle local activity handling / cross-tab pings. */
export const SESSION_ACTIVITY_THROTTLE_MS = 1_000;

export const SESSION_IDLE_MESSAGE =
  "Your session has expired due to inactivity. Please sign in again to continue.";

export const ADMIN_SESSION_SYNC_CHANNEL = "kitchenos-admin-session";
export const TENANT_SESSION_SYNC_CHANNEL = "kitchenos-tenant-session";
