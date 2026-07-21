import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTenantAuth } from "./TenantAuthContext";

export function RequireTenantAuth() {
  const { isAuthenticated, tenant } = useTenantAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/tenant/login" replace state={{ from: location }} />;
  }

  if (
    tenant?.mustChangePassword &&
    location.pathname !== "/tenant/change-password"
  ) {
    return <Navigate to="/tenant/change-password" replace />;
  }

  return <Outlet />;
}
