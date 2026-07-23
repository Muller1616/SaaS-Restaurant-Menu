import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { TENANT_SESSION_SYNC_CHANNEL } from "../../lib/session-timeout-config";
import { looksLikePublicQrId, publicQrPath, tenantPortalPath } from "../../lib/tenant-paths";
import { IdleSessionGuard } from "../session/IdleSessionGuard";
import { useTenantAuth } from "./TenantAuthContext";

export function RequireTenantAuth() {
  const { isAuthenticated, tenant, logout } = useTenantAuth();
  const location = useLocation();
  const { tenantSlug } = useParams();

  // Opaque QR ids belong to the public menu — never remap into the portal.
  if (tenantSlug && looksLikePublicQrId(tenantSlug)) {
    return <Navigate to={publicQrPath(tenantSlug)} replace />;
  }

  if (!isAuthenticated || !tenant) {
    return <Navigate to="/tenant/login" replace state={{ from: location }} />;
  }

  // URL slug must match the signed-in restaurant (tenant isolation).
  if (tenantSlug && tenant.slug && tenantSlug !== tenant.slug) {
    const parts = location.pathname.split("/").filter(Boolean);
    // /r/{wrongSlug}/menu → /r/{ownSlug}/menu
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
