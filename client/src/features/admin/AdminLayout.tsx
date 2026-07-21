import { Outlet, useNavigate } from "react-router-dom";
import { AppNavLink } from "../navigation/AppNavLink";
import { PageTransition } from "../navigation/PageTransition";
import { useAdminAuth } from "./AdminAuthContext";

const navItems = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/tenants", label: "Restaurants" },
  { to: "/admin/branches", label: "Branches" },
  { to: "/admin/approvals", label: "Applications" },
  { to: "/admin/subscriptions", label: "Subscriptions" },
  { to: "/admin/payments", label: "Payments" },
  { to: "/admin/plans", label: "Plans" },
  { to: "/admin/notifications", label: "Announcements" },
  { to: "/admin/activity", label: "Activity" },
  { to: "/admin/settings", label: "Settings" },
] as const;

export function AdminLayout() {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/admin/login");
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-[var(--night)] text-[var(--mist)]">
      <div
        className="pointer-events-none fixed inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(circle at 8% 0%, rgba(212,165,116,0.16), transparent 32%), radial-gradient(circle at 92% 8%, rgba(255,139,92,0.09), transparent 28%)",
        }}
      />

      <div className="relative flex h-full min-h-0">
        <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-[var(--line)] bg-[rgba(18,26,23,0.92)] backdrop-blur-xl lg:flex">
          <div className="shrink-0 border-b border-[var(--line)] px-6 py-5">
            <p className="text-[11px] tracking-[0.3em] text-[var(--gold)] uppercase">
              KitchenOS
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">
              Admin
            </h1>
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3">
            {navItems.map((item) => (
              <AppNavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  [
                    "rounded-xl px-3 py-2.5 text-sm transition-colors",
                    isActive
                      ? "bg-[var(--gold)] font-semibold text-[var(--night)]"
                      : "text-white/70 hover:bg-white/6 hover:text-white",
                  ].join(" ")
                }
              >
                {item.label}
              </AppNavLink>
            ))}
          </nav>
          <div className="shrink-0 border-t border-[var(--line)] p-4 text-sm">
            <p className="font-medium text-white">{admin?.name}</p>
            <p className="truncate text-[var(--muted)]">{admin?.email}</p>
            <p className="mt-1 text-[11px] tracking-[0.18em] text-[var(--gold)] uppercase">
              {admin?.role === "SUPER_ADMIN" ? "Super admin" : "Admin"}
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 w-full rounded-xl border border-white/15 px-3 py-2 text-left hover:border-[var(--gold)] hover:text-[var(--gold-soft)]"
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[rgba(18,26,23,0.75)] px-4 py-3 backdrop-blur-xl lg:px-8">
            <div>
              <p className="text-[11px] tracking-[0.25em] text-[var(--gold)] uppercase lg:hidden">
                KitchenOS Admin
              </p>
              <h2 className="font-[family-name:var(--font-display)] text-xl text-white lg:text-2xl">
                Control Panel
              </h2>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-white/15 px-3 py-2 text-sm lg:hidden"
            >
              Sign out
            </button>
          </header>

          <nav className="flex shrink-0 gap-2 overflow-x-auto overscroll-contain border-b border-[var(--line)] bg-[rgba(18,26,23,0.55)] px-4 py-2 lg:hidden">
            {navItems.map((item) => (
              <AppNavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  [
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-[var(--gold)] font-semibold text-[var(--night)]"
                      : "border border-white/10 text-white/75",
                  ].join(" ")
                }
              >
                {item.label}
              </AppNavLink>
            ))}
          </nav>

          <main
            data-scroll-root
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 lg:px-8 [overflow-anchor:none]"
          >
            <PageTransition>
              <Outlet />
            </PageTransition>
          </main>
        </div>
      </div>
    </div>
  );
}
