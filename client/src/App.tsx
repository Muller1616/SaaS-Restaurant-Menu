import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { AdminAuthProvider } from "./features/admin/AdminAuthContext";
import { AdminLayout } from "./features/admin/AdminLayout";
import { RequireAdminAuth } from "./features/admin/RequireAdminAuth";
import { NavigationHistoryProvider } from "./features/navigation/NavigationHistoryContext";
import { RouteTransitionOutlet } from "./features/navigation/PageTransition";
import { RequireTenantAuth } from "./features/tenant/RequireTenantAuth";
import {
  TenantAuthProvider,
  useTenantAuth,
} from "./features/tenant/TenantAuthContext";
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
import { TenantActivatePage } from "./pages/tenant/TenantActivatePage";
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
import {
  looksLikePublicQrId,
  tenantPortalPath,
} from "./lib/tenant-paths";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/** Old `/tenant/activate/:slug/:token` → `/r/:slug/activate/:token`. */
function LegacyActivateRedirect() {
  const { slug, token } = useParams();
  if (!slug || !token) return <Navigate to="/tenant/login" replace />;
  return <Navigate to={`/r/${slug}/activate/${token}`} replace />;
}

/** Old `/{slug}/…` portal → `/r/{slug}/…`. */
function LegacyBareSlugRedirect() {
  const { tenantSlug, "*": rest } = useParams();
  const location = useLocation();
  const reserved = new Set([
    "admin",
    "api",
    "r",
    "register",
    "tenant",
    "menu",
    "login",
  ]);
  if (!tenantSlug || reserved.has(tenantSlug)) {
    return <Navigate to="/" replace />;
  }
  const suffix = rest ? `/${rest}` : "/dashboard";
  return (
    <Navigate to={`/r/${tenantSlug}${suffix}${location.search}`} replace />
  );
}

/** Old `/tenant/*` → `/r/{slug}/*` when authenticated. */
function LegacyTenantPortalRedirect() {
  const { isAuthenticated, tenant } = useTenantAuth();
  const location = useLocation();

  if (!isAuthenticated || !tenant?.slug) {
    return (
      <Navigate to="/tenant/login" replace state={{ from: location }} />
    );
  }

  const rest = location.pathname.replace(/^\/tenant\/?/, "");
  const segments = rest.split("/").filter(Boolean);
  const mapped = segments.map((s) => (s === "branches" ? "branch" : s));
  const target =
    mapped.length === 0
      ? tenantPortalPath(tenant.slug)
      : tenantPortalPath(tenant.slug, ...mapped);

  return <Navigate to={`${target}${location.search}`} replace />;
}

/**
 * Single `/r/:tenantSlug` tree:
 * - 32-hex opaque QR id → customer public menu (never portal)
 * - tenant slug + portal segment → authenticated workspace
 *
 * Important: a separate sibling `/r/:publicId` route used to compete with
 * this tree's index (`→ dashboard`), so Preview Menu landed on the portal.
 */
function PublicOrTenantPortal() {
  const { tenantSlug } = useParams();
  if (tenantSlug && looksLikePublicQrId(tenantSlug)) {
    return <PublicMenuPage />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NavigationHistoryProvider>
          <AdminAuthProvider>
            <TenantAuthProvider>
              <Routes>
                <Route element={<RouteTransitionOutlet />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/tenant/login" element={<TenantLoginPage />} />
                  <Route
                    path="/tenant/forgot-password"
                    element={<TenantForgotPasswordPage />}
                  />
                  <Route
                    path="/tenant/reset-password"
                    element={<TenantResetPasswordPage />}
                  />
                  <Route
                    path="/tenant/activate/:slug/:token"
                    element={<LegacyActivateRedirect />}
                  />
                  <Route path="/admin/login" element={<AdminLoginPage />} />
                </Route>

                <Route path="/tenant" element={<LegacyTenantPortalRedirect />} />
                <Route
                  path="/tenant/*"
                  element={<LegacyTenantPortalRedirect />}
                />

                {/*
                  /r/{publicQrId} → public menu
                  /r/{tenant-slug}/… → tenant portal
                */}
                <Route path="/r/:tenantSlug" element={<PublicOrTenantPortal />}>
                  <Route element={<RouteTransitionOutlet />}>
                    <Route
                      path="activate/:activationToken"
                      element={<TenantActivatePage />}
                    />
                  </Route>

                  <Route element={<RequireTenantAuth />}>
                    <Route element={<RouteTransitionOutlet />}>
                      <Route
                        path="change-password"
                        element={<TenantChangePasswordPage />}
                      />
                    </Route>
                    <Route element={<TenantLayout />}>
                      <Route
                        index
                        element={<Navigate to="dashboard" replace />}
                      />
                      <Route
                        path="dashboard"
                        element={<TenantDashboardPage />}
                      />
                      <Route path="branch" element={<TenantBranchesPage />} />
                      <Route
                        path="branches"
                        element={<Navigate to="../branch" replace />}
                      />
                      <Route path="menu" element={<TenantMenuPage />} />
                      <Route path="qr" element={<TenantQrPage />} />
                      <Route
                        path="analytics"
                        element={<TenantAnalyticsPage />}
                      />
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
                      <Route
                        path="*"
                        element={<Navigate to="dashboard" replace />}
                      />
                    </Route>
                  </Route>
                </Route>

                <Route path="/admin" element={<RequireAdminAuth />}>
                  <Route element={<AdminLayout />}>
                    <Route
                      index
                      element={<Navigate to="dashboard" replace />}
                    />
                    <Route path="dashboard" element={<AdminDashboardPage />} />
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
                    <Route
                      path="*"
                      element={<Navigate to="dashboard" replace />}
                    />
                  </Route>
                </Route>

                {/* Legacy bare-slug portal (after reserved routes) */}
                <Route
                  path="/:tenantSlug/*"
                  element={<LegacyBareSlugRedirect />}
                />
                <Route
                  path="/:tenantSlug"
                  element={<LegacyBareSlugRedirect />}
                />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </TenantAuthProvider>
          </AdminAuthProvider>
        </NavigationHistoryProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
