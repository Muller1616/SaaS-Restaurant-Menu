import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  ADMIN_SESSION_IDLE_MS,
  ADMIN_SESSION_SYNC_CHANNEL,
  ADMIN_SESSION_WARNING_MS,
} from "../../lib/session-timeout-config";
import { IdleSessionGuard } from "../session/IdleSessionGuard";
import { useAdminAuth } from "./AdminAuthContext";

/**
 * Central guard for every `/admin/*` route except `/admin/login`.
 * Waits for session bootstrap so stale localStorage tokens cannot open the portal.
 */
export function RequireAdminAuth() {
  const { status, isAuthenticated, logout } = useAdminAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--night)] text-[var(--muted)]">
        <div className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] px-8 py-6 text-center">
          <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
            KitchenOS
          </p>
          <p className="mt-3 text-sm">Verifying admin session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: location }}
      />
    );
  }

  return (
    <IdleSessionGuard
      enabled
      loginPath="/admin/login"
      channelName={ADMIN_SESSION_SYNC_CHANNEL}
      idleMs={ADMIN_SESSION_IDLE_MS}
      warningMs={ADMIN_SESSION_WARNING_MS}
      onLogout={logout}
    >
      <Outlet />
    </IdleSessionGuard>
  );
}
