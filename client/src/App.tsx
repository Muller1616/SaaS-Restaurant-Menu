import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import { AdminAuthProvider } from "./features/admin/AdminAuthContext";
import { AdminLayout } from "./features/admin/AdminLayout";
import { RequireAdminAuth } from "./features/admin/RequireAdminAuth";
import { RequireTenantAuth } from "./features/tenant/RequireTenantAuth";
import { TenantAuthProvider } from "./features/tenant/TenantAuthContext";
import { TenantLayout } from "./features/tenant/TenantLayout";
import { AdminActivityPage } from "./pages/admin/AdminActivityPage";
import { AdminApprovalsPage } from "./pages/admin/AdminApprovalsPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminNotificationsPage } from "./pages/admin/AdminNotificationsPage";
import { AdminBranchesPage } from "./pages/admin/AdminBranchesPage";
import { AdminPaymentsPage } from "./pages/admin/AdminPaymentsPage";
import { AdminPlansPage } from "./pages/admin/AdminPlansPage";
import { AdminSettingsPage } from "./pages/admin/AdminSettingsPage";
import { AdminSubscriptionsPage } from "./pages/admin/AdminSubscriptionsPage";
import { AdminTenantsPage } from "./pages/admin/AdminTenantsPage";
import { HomePage } from "./pages/HomePage";
import { PublicMenuPage } from "./pages/PublicMenuPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TenantAnalyticsPage } from "./pages/tenant/TenantAnalyticsPage";
import { TenantBranchesPage } from "./pages/tenant/TenantBranchesPage";
import { TenantChangePasswordPage } from "./pages/tenant/TenantChangePasswordPage";
import { TenantDashboardPage } from "./pages/tenant/TenantDashboardPage";
import { TenantForgotPasswordPage } from "./pages/tenant/TenantForgotPasswordPage";
import { TenantLoginPage } from "./pages/tenant/TenantLoginPage";
import { TenantMenuPage } from "./pages/tenant/TenantMenuPage";
import { TenantNotificationsPage } from "./pages/tenant/TenantNotificationsPage";
import { TenantPaymentsPage } from "./pages/tenant/TenantPaymentsPage";
import { TenantQrPage } from "./pages/tenant/TenantQrPage";
import { TenantResetPasswordPage } from "./pages/tenant/TenantResetPasswordPage";
import { TenantSettingsPage } from "./pages/tenant/TenantSettingsPage";
import { TenantSubscriptionPage } from "./pages/tenant/TenantSubscriptionPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/** FR-5.1 `/menu/...` redirects to canonical FR-10.1 `/r/...`. */
function MenuPathAlias() {
  const { tenantSlug, branchSlug } = useParams();
  if (!tenantSlug) return <Navigate to="/" replace />;
  const to = branchSlug
    ? `/r/${tenantSlug}/${branchSlug}`
    : `/r/${tenantSlug}`;
  return <Navigate to={to} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AdminAuthProvider>
          <TenantAuthProvider>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/r/:tenantSlug" element={<PublicMenuPage />} />
              <Route
                path="/r/:tenantSlug/:branchSlug"
                element={<PublicMenuPage />}
              />
              {/* FR-5.1 alias → canonical FR-10.1 /r/... */}
              <Route path="/menu/:tenantSlug" element={<MenuPathAlias />} />
              <Route
                path="/menu/:tenantSlug/:branchSlug"
                element={<MenuPathAlias />}
              />

              <Route path="/tenant/login" element={<TenantLoginPage />} />
              <Route
                path="/tenant/forgot-password"
                element={<TenantForgotPasswordPage />}
              />
              <Route
                path="/tenant/reset-password"
                element={<TenantResetPasswordPage />}
              />

              <Route path="/tenant" element={<RequireTenantAuth />}>
                <Route
                  path="change-password"
                  element={<TenantChangePasswordPage />}
                />
                <Route element={<TenantLayout />}>
                  <Route index element={<TenantDashboardPage />} />
                  <Route path="branches" element={<TenantBranchesPage />} />
                  <Route path="menu" element={<TenantMenuPage />} />
                  <Route path="qr" element={<TenantQrPage />} />
                  <Route path="analytics" element={<TenantAnalyticsPage />} />
                  <Route
                    path="subscription"
                    element={<TenantSubscriptionPage />}
                  />
                  <Route path="payments" element={<TenantPaymentsPage />} />
                  <Route
                    path="notifications"
                    element={<TenantNotificationsPage />}
                  />
                  <Route path="settings" element={<TenantSettingsPage />} />
                </Route>
              </Route>

              <Route path="/admin/login" element={<AdminLoginPage />} />

              <Route path="/admin" element={<RequireAdminAuth />}>
                <Route element={<AdminLayout />}>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="tenants" element={<AdminTenantsPage />} />
                  <Route path="branches" element={<AdminBranchesPage />} />
                  <Route path="approvals" element={<AdminApprovalsPage />} />
                  <Route
                    path="subscriptions"
                    element={<AdminSubscriptionsPage />}
                  />
                  <Route path="payments" element={<AdminPaymentsPage />} />
                  <Route path="plans" element={<AdminPlansPage />} />
                  <Route
                    path="notifications"
                    element={<AdminNotificationsPage />}
                  />
                  <Route path="activity" element={<AdminActivityPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </TenantAuthProvider>
        </AdminAuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
