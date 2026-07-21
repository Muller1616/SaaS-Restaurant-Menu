import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, type ApiSuccess } from "../../lib/api";
import { TenantSubscriptionBanner } from "./TenantSubscriptionBanner";
import { useTenantAuth } from "./TenantAuthContext";

const baseNavItems = [
  { to: "/tenant", label: "Dashboard", end: true },
  { to: "/tenant/branches", label: "Branches" },
  { to: "/tenant/menu", label: "Menu" },
  { to: "/tenant/qr", label: "QR Code" },
  { to: "/tenant/analytics", label: "Analytics" },
  { to: "/tenant/subscription", label: "Subscription" },
  { to: "/tenant/payments", label: "Payments" },
  { to: "/tenant/notifications", label: "Inbox", badge: true },
  { to: "/tenant/settings", label: "Settings" },
] as const;

async function fetchUnreadCount() {
  const { data } = await api.get<ApiSuccess<{ unread: number }>>(
    "/tenant/settings/notifications/unread-count",
  );
  return data.data.unread;
}

export function TenantLayout() {
  const { tenant, currentBranchId, setBranch, logout } = useTenantAuth();
  const navigate = useNavigate();
  const branches = tenant?.branches ?? [];
  const singleBranch = branches.length <= 1;
  const currentBranch =
    branches.find((branch) => branch.id === currentBranchId) ?? branches[0];

  const maxBranches = tenant?.selectedPlan.maxBranches ?? 1;
  const canAddBranch = maxBranches < 0 || branches.length < maxBranches;
  const navItems = baseNavItems;

  const unread = useQuery({
    queryKey: ["tenant", "notifications", "unread"],
    queryFn: fetchUnreadCount,
    refetchInterval: 30_000,
  });

  const unreadCount = unread.data ?? 0;

  function handleLogout() {
    logout();
    navigate("/tenant/login");
  }

  function onBranchSelect(value: string) {
    if (value === "__add__") {
      navigate("/tenant/branches?add=1");
      return;
    }
    setBranch(value);
  }

  return (
    <div className="min-h-screen bg-[var(--night)] text-[var(--mist)]">
      <div
        className="pointer-events-none fixed inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(circle at 10% 0%, rgba(212,165,116,0.14), transparent 30%), radial-gradient(circle at 90% 10%, rgba(255,139,92,0.08), transparent 28%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-[var(--line)] bg-[rgba(18,26,23,0.88)] px-5 py-4 backdrop-blur-xl">
          <div>
            <p className="text-[11px] tracking-[0.3em] text-[var(--gold)] uppercase">
              KitchenOS
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-white sm:text-3xl">
              {tenant?.businessName}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-black/25 px-3 py-2 text-sm">
              <span className="text-[var(--gold-soft)]">Branch</span>
              <select
                value={currentBranch?.id ?? ""}
                onChange={(e) => onBranchSelect(e.target.value)}
                className="max-w-[180px] bg-transparent text-white outline-none"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id} className="bg-[#121a17]">
                    {branch.name}
                    {branch.id === currentBranchId ? " ✓" : ""}
                  </option>
                ))}
                <option
                  value="__add__"
                  className="bg-[#121a17]"
                  disabled={!canAddBranch}
                >
                  {canAddBranch ? "+ Add new branch" : "+ Limit reached"}
                </option>
              </select>
            </label>
            {singleBranch && (
              <span className="hidden text-xs text-[var(--muted)] sm:inline">
                Single-branch plan
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-white/15 px-4 py-2 text-sm hover:border-[var(--gold)] hover:text-[var(--gold-soft)]"
            >
              Sign out
            </button>
          </div>
        </header>

        <nav className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item ? item.end : false}
              className={({ isActive }) =>
                [
                  "relative whitespace-nowrap rounded-full px-4 py-2 text-sm transition",
                  isActive
                    ? "bg-[var(--gold)] font-semibold text-[var(--night)]"
                    : "border border-white/10 text-white/75 hover:border-[var(--gold)]/50 hover:text-white",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <span className="inline-flex items-center gap-2">
                  {item.label}
                  {"badge" in item && item.badge && unreadCount > 0 && (
                    <span
                      className={[
                        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                        isActive
                          ? "bg-[var(--night)] text-[var(--gold-soft)]"
                          : "bg-[var(--ember)] text-white",
                      ].join(" ")}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <TenantSubscriptionBanner />

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
