import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type ApiSuccess } from "../../lib/api";

type DashboardStats = {
  totalTenants: number;
  activeSubscriptions: number;
  pendingApprovals: number;
  pendingPayments: number;
  expiredThisWeek: number;
  nearExpiry: number;
};

async function fetchStats() {
  const { data } = await api.get<ApiSuccess<DashboardStats>>(
    "/admin/dashboard/stats",
  );
  return data.data;
}

function StatCard({
  label,
  value,
  emphasize,
  to,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
  to?: string;
}) {
  const content = (
    <div
      className={[
        "rounded-[1.75rem] border p-5 transition",
        emphasize
          ? "border-[var(--gold)]/40 bg-[linear-gradient(135deg,rgba(212,165,116,0.16),rgba(18,26,23,0.95)_45%)]"
          : "border-[var(--line)] bg-[var(--panel)]",
        to ? "hover:-translate-y-0.5 hover:border-[var(--gold)]/60" : "",
      ].join(" ")}
    >
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">
        {value}
      </p>
      {emphasize && value > 0 && (
        <p className="mt-2 text-xs font-semibold tracking-wide text-[var(--gold-soft)] uppercase">
          Needs attention
        </p>
      )}
    </div>
  );

  if (to) return <Link to={to}>{content}</Link>;
  return content;
}

export function AdminDashboardPage() {
  const stats = useQuery({
    queryKey: ["admin", "dashboard", "stats"],
    queryFn: fetchStats,
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Overview
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-[var(--muted)]">
          Overview of tenants, subscriptions, and pending work.
        </p>
      </div>

      {stats.isLoading && (
        <p className="text-[var(--muted)]">Loading dashboard stats…</p>
      )}
      {stats.isError && (
        <p className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          Failed to load dashboard stats.
        </p>
      )}

      {stats.data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Total Tenants" value={stats.data.totalTenants} />
          <StatCard
            label="Active Subscriptions"
            value={stats.data.activeSubscriptions}
          />
          <StatCard
            label="Pending Approvals"
            value={stats.data.pendingApprovals}
            emphasize
            to="/admin/approvals"
          />
          <StatCard
            label="Pending Payments"
            value={stats.data.pendingPayments}
            emphasize
            to="/admin/payments"
          />
          <StatCard
            label="Near Expiry (≤7 days)"
            value={stats.data.nearExpiry}
          />
          <StatCard
            label="Expired This Week"
            value={stats.data.expiredThisWeek}
          />
        </div>
      )}
    </div>
  );
}
