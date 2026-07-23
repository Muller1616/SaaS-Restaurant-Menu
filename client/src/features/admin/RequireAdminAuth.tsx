import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  ADMIN_SESSION_IDLE_MS,
  ADMIN_SESSION_SYNC_CHANNEL,
  ADMIN_SESSION_WARNING_MS,
} from "../../lib/session-timeout-config";
import { IdleSessionGuard } from "../session/IdleSessionGuard";
import { useAdminAuth } from "./AdminAuthContext";

export function RequireAdminAuth() {
  const { isAuthenticated, logout } = useAdminAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
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
