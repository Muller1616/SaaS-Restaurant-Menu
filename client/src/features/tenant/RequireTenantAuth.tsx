import { Navigate, Outlet, useLocation } from "react-router-dom";
import { TENANT_SESSION_SYNC_CHANNEL } from "../../lib/session-timeout-config";
import { IdleSessionGuard } from "../session/IdleSessionGuard";
import { useTenantAuth } from "./TenantAuthContext";

export function RequireTenantAuth() {
  const { isAuthenticated, tenant, logout } = useTenantAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/tenant/login" replace state={{ from: location }} />;
  }

  return (
    <IdleSessionGuard
      enabled
      loginPath="/tenant/login"
      channelName={TENANT_SESSION_SYNC_CHANNEL}
      onLogout={logout}
    >
      {tenant?.mustChangePassword &&
      location.pathname !== "/tenant/change-password" ? (
        <Navigate to="/tenant/change-password" replace />
      ) : (
        <Outlet />
      )}
    </IdleSessionGuard>
  );
}
