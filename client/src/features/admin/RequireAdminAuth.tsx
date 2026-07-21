import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  ADMIN_SESSION_SYNC_CHANNEL,
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
      onLogout={logout}
    >
      <Outlet />
    </IdleSessionGuard>
  );
}
