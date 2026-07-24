import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { TENANT_SESSION_SYNC_CHANNEL } from "../../lib/session-timeout-config";
import {
  looksLikePublicQrId,
  publicQrPath,
  tenantPortalPath,
} from "../../lib/tenant-paths";
import { IdleSessionGuard } from "../session/IdleSessionGuard";
import { useTenantAuth } from "./TenantAuthContext";

/**
 * Central guard for tenant portal routes.
 * Waits for /auth/tenant/me bootstrap so stale localStorage cannot open the portal.
 */
export function RequireTenantAuth() {
  const { status, isAuthenticated, tenant, logout } = useTenantAuth();
  const location = useLocation();
  const { tenantSlug } = useParams();

  if (tenantSlug && looksLikePublicQrId(tenantSlug)) {
    return <Navigate to={publicQrPath(tenantSlug)} replace />;
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--night)] text-[var(--muted)]">
        <div className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] px-8 py-6 text-center">
          <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
            KitchenOS
          </p>
          <p className="mt-3 text-sm">Verifying session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !tenant) {
    return (
      <Navigate to="/tenant/login" replace state={{ from: location }} />
    );
  }

  if (tenantSlug && tenant.slug && tenantSlug !== tenant.slug) {
    const parts = location.pathname.split("/").filter(Boolean);
    const page = parts[2];
    const target = page
      ? tenantPortalPath(tenant.slug, page, ...parts.slice(3))
      : tenantPortalPath(tenant.slug);
    return <Navigate to={`${target}${location.search}`} replace />;
  }

  const changePasswordPath = tenantPortalPath(tenant.slug, "change-password");

  return (
    <IdleSessionGuard
      enabled
      loginPath="/tenant/login"
      channelName={TENANT_SESSION_SYNC_CHANNEL}
      onLogout={logout}
    >
      {tenant.mustChangePassword && location.pathname !== changePasswordPath ? (
        <Navigate to={changePasswordPath} replace />
      ) : (
        <Outlet />
      )}
    </IdleSessionGuard>
  );
}
