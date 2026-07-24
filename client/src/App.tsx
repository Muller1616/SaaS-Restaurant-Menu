import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, type ReactNode } from "react";
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
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { NavigationHistoryProvider } from "./features/navigation/NavigationHistoryContext";
import { RouteTransitionOutlet } from "./features/navigation/PageTransition";
import { RequireTenantAuth } from "./features/tenant/RequireTenantAuth";
import {
  TenantAuthProvider,
  useTenantAuth,
} from "./features/tenant/TenantAuthContext";
import { TenantLayout } from "./features/tenant/TenantLayout";
import { HomePage } from "./pages/HomePage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { TenantLoginPage } from "./pages/tenant/TenantLoginPage";
import {
  looksLikePublicQrId,
  tenantPortalPath,
} from "./lib/tenant-paths";

const PublicMenuPage = lazy(() =>
  import("./pages/PublicMenuPage").then((m) => ({
    default: m.PublicMenuPage,
  })),
);
const RegisterPage = lazy(() =>
  import("./pages/RegisterPage").then((m) => ({
    default: m.RegisterPage,
  })),
);
const AdminActivityPage = lazy(() =>
  import("./pages/admin/AdminActivityPage").then((m) => ({
    default: m.AdminActivityPage,
  })),
);
const AdminApprovalsPage = lazy(() =>
  import("./pages/admin/AdminApprovalsPage").then((m) => ({
    default: m.AdminApprovalsPage,
  })),
);
const AdminDashboardPage = lazy(() =>
  import("./pages/admin/AdminDashboardPage").then((m) => ({
    default: m.AdminDashboardPage,
  })),
);
const AdminNotificationsPage = lazy(() =>
  import("./pages/admin/AdminNotificationsPage").then((m) => ({
    default: m.AdminNotificationsPage,
  })),
);
const AdminBranchesPage = lazy(() =>
  import("./pages/admin/AdminBranchesPage").then((m) => ({
    default: m.AdminBranchesPage,
  })),
);
const AdminPaymentsPage = lazy(() =>
  import("./pages/admin/AdminPaymentsPage").then((m) => ({
    default: m.AdminPaymentsPage,
  })),
);
const AdminPlansPage = lazy(() =>
  import("./pages/admin/AdminPlansPage").then((m) => ({
    default: m.AdminPlansPage,
  })),
);
const AdminSettingsPage = lazy(() =>
  import("./pages/admin/AdminSettingsPage").then((m) => ({
    default: m.AdminSettingsPage,
  })),
);
const AdminSubscriptionsPage = lazy(() =>
  import("./pages/admin/AdminSubscriptionsPage").then((m) => ({
    default: m.AdminSubscriptionsPage,
  })),
);
const AdminTenantsPage = lazy(() =>
  import("./pages/admin/AdminTenantsPage").then((m) => ({
    default: m.AdminTenantsPage,
  })),
);

const TenantActivatePage = lazy(() =>
  import("./pages/tenant/TenantActivatePage").then((m) => ({
    default: m.TenantActivatePage,
  })),
);
const TenantAnalyticsPage = lazy(() =>
  import("./pages/tenant/TenantAnalyticsPage").then((m) => ({
    default: m.TenantAnalyticsPage,
  })),
);
const TenantBranchesPage = lazy(() =>
  import("./pages/tenant/TenantBranchesPage").then((m) => ({
    default: m.TenantBranchesPage,
  })),
);
const TenantChangePasswordPage = lazy(() =>
  import("./pages/tenant/TenantChangePasswordPage").then((m) => ({
    default: m.TenantChangePasswordPage,
  })),
);
const TenantDashboardPage = lazy(() =>
  import("./pages/tenant/TenantDashboardPage").then((m) => ({
    default: m.TenantDashboardPage,
  })),
);
const TenantForgotPasswordPage = lazy(() =>
  import("./pages/tenant/TenantForgotPasswordPage").then((m) => ({
    default: m.TenantForgotPasswordPage,
  })),
);
const TenantMenuPage = lazy(() =>
  import("./pages/tenant/TenantMenuPage").then((m) => ({
    default: m.TenantMenuPage,
  })),
);
const TenantNotificationsPage = lazy(() =>
  import("./pages/tenant/TenantNotificationsPage").then((m) => ({
    default: m.TenantNotificationsPage,
  })),
);
const TenantPaymentsPage = lazy(() =>
  import("./pages/tenant/TenantPaymentsPage").then((m) => ({
    default: m.TenantPaymentsPage,
  })),
);
const TenantQrPage = lazy(() =>
  import("./pages/tenant/TenantQrPage").then((m) => ({
    default: m.TenantQrPage,
  })),
);
const TenantResetPasswordPage = lazy(() =>
  import("./pages/tenant/TenantResetPasswordPage").then((m) => ({
    default: m.TenantResetPasswordPage,
  })),
);
const TenantSettingsPage = lazy(() =>
  import("./pages/tenant/TenantSettingsPage").then((m) => ({
    default: m.TenantSettingsPage,
  })),
);
const TenantSubscriptionPage = lazy(() =>
  import("./pages/tenant/TenantSubscriptionPage").then((m) => ({
    default: m.TenantSubscriptionPage,
  })),
);

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

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted)]">
      Loading…
    </div>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

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
 */
function PublicOrTenantPortal() {
  const { tenantSlug } = useParams();
  if (tenantSlug && looksLikePublicQrId(tenantSlug)) {
    return (
      <LazyRoute>
        <PublicMenuPage />
      </LazyRoute>
    );
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
                  <Route
                    path="/register"
                    element={
                      <LazyRoute>
                        <RegisterPage />
                      </LazyRoute>
                    }
                  />
                  <Route path="/tenant/login" element={<TenantLoginPage />} />
                  <Route
                    path="/tenant/forgot-password"
                    element={
                      <LazyRoute>
                        <TenantForgotPasswordPage />
                      </LazyRoute>
                    }
                  />
                  <Route
                    path="/tenant/reset-password"
                    element={
                      <LazyRoute>
                        <TenantResetPasswordPage />
                      </LazyRoute>
                    }
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

                <Route path="/r/:tenantSlug" element={<PublicOrTenantPortal />}>
                  <Route element={<RouteTransitionOutlet />}>
                    <Route
                      path="activate/:activationToken"
                      element={
                        <LazyRoute>
                          <TenantActivatePage />
                        </LazyRoute>
                      }
                    />
                  </Route>

                  <Route element={<RequireTenantAuth />}>
                    <Route element={<RouteTransitionOutlet />}>
                      <Route
                        path="change-password"
                        element={
                          <LazyRoute>
                            <TenantChangePasswordPage />
                          </LazyRoute>
                        }
                      />
                    </Route>
                    <Route
                      element={
                        <AppErrorBoundary>
                          <TenantLayout />
                        </AppErrorBoundary>
                      }
                    >
                      <Route
                        index
                        element={<Navigate to="dashboard" replace />}
                      />
                      <Route
                        path="dashboard"
                        element={
                          <LazyRoute>
                            <TenantDashboardPage />
                          </LazyRoute>
                        }
                      />
                      <Route
                        path="branch"
                        element={
                          <LazyRoute>
                            <TenantBranchesPage />
                          </LazyRoute>
                        }
                      />
                      <Route
                        path="branches"
                        element={<Navigate to="../branch" replace />}
                      />
                      <Route
                        path="menu"
                        element={
                          <LazyRoute>
                            <TenantMenuPage />
                          </LazyRoute>
                        }
                      />
                      <Route
                        path="qr"
                        element={
                          <LazyRoute>
                            <TenantQrPage />
                          </LazyRoute>
                        }
                      />
                      <Route
                        path="analytics"
                        element={
                          <LazyRoute>
                            <TenantAnalyticsPage />
                          </LazyRoute>
                        }
                      />
                      <Route
                        path="subscription"
                        element={
                          <LazyRoute>
                            <TenantSubscriptionPage />
                          </LazyRoute>
                        }
                      />
                      <Route
                        path="payments"
                        element={
                          <LazyRoute>
                            <TenantPaymentsPage />
                          </LazyRoute>
                        }
                      />
                      <Route
                        path="notifications"
                        element={
                          <LazyRoute>
                            <TenantNotificationsPage />
                          </LazyRoute>
                        }
                      />
                      <Route
                        path="settings"
                        element={
                          <LazyRoute>
                            <TenantSettingsPage />
                          </LazyRoute>
                        }
                      />
                      <Route
                        path="*"
                        element={<Navigate to="dashboard" replace />}
                      />
                    </Route>
                  </Route>
                </Route>

                <Route path="/admin" element={<RequireAdminAuth />}>
                  <Route
                    element={
                      <AppErrorBoundary>
                        <AdminLayout />
                      </AppErrorBoundary>
                    }
                  >
                    <Route
                      index
                      element={<Navigate to="dashboard" replace />}
                    />
                    <Route
                      path="dashboard"
                      element={
                        <LazyRoute>
                          <AdminDashboardPage />
                        </LazyRoute>
                      }
                    />
                    <Route
                      path="tenants"
                      element={
                        <LazyRoute>
                          <AdminTenantsPage />
                        </LazyRoute>
                      }
                    />
                    <Route
                      path="branches"
                      element={
                        <LazyRoute>
                          <AdminBranchesPage />
                        </LazyRoute>
                      }
                    />
                    <Route
                      path="approvals"
                      element={
                        <LazyRoute>
                          <AdminApprovalsPage />
                        </LazyRoute>
                      }
                    />
                    <Route
                      path="subscriptions"
                      element={
                        <LazyRoute>
                          <AdminSubscriptionsPage />
                        </LazyRoute>
                      }
                    />
                    <Route
                      path="payments"
                      element={
                        <LazyRoute>
                          <AdminPaymentsPage />
                        </LazyRoute>
                      }
                    />
                    <Route
                      path="plans"
                      element={
                        <LazyRoute>
                          <AdminPlansPage />
                        </LazyRoute>
                      }
                    />
                    <Route
                      path="notifications"
                      element={
                        <LazyRoute>
                          <AdminNotificationsPage />
                        </LazyRoute>
                      }
                    />
                    <Route
                      path="activity"
                      element={
                        <LazyRoute>
                          <AdminActivityPage />
                        </LazyRoute>
                      }
                    />
                    <Route
                      path="settings"
                      element={
                        <LazyRoute>
                          <AdminSettingsPage />
                        </LazyRoute>
                      }
                    />
                    <Route
                      path="*"
                      element={<Navigate to="dashboard" replace />}
                    />
                  </Route>
                </Route>

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
