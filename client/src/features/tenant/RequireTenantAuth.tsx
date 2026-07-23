import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { TENANT_SESSION_SYNC_CHANNEL } from "../../lib/session-timeout-config";
import { tenantPortalPath } from "../../lib/tenant-paths";
import { IdleSessionGuard } from "../session/IdleSessionGuard";
import { useTenantAuth } from "./TenantAuthContext";

export function RequireTenantAuth() {
  const { isAuthenticated, tenant, logout } = useTenantAuth();
  const location = useLocation();
  const { tenantSlug } = useParams();

  if (!isAuthenticated || !tenant) {
    return <Navigate to="/tenant/login" replace state={{ from: location }} />;
  }

  // URL slug must match the signed-in restaurant (prevents cross-tenant URL probing).
  if (tenantSlug && tenant.slug && tenantSlug !== tenant.slug) {
    const rest = location.pathname
      .replace(new RegExp(`^/${tenantSlug}`), "")
      .replace(/^\//, "");
    const target = rest
      ? tenantPortalPath(tenant.slug, ...rest.split("/").filter(Boolean))
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
