import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChartCard, KpiCard } from "../../components/charts/ChartCard";
import {
  ComparisonBarChart,
  DistributionDonutChart,
  DualAxisPaymentsChart,
  TrendAreaChart,
} from "../../components/charts/Charts";
import { formatCompactNumber } from "../../components/charts/chart-theme";
import { formatEtb } from "../../lib/plans";
import { api, type ApiSuccess } from "../../lib/api";

type DashboardStats = {
  totalTenants: number;
  activeSubscriptions: number;
  pendingApprovals: number;
  pendingPayments: number;
  expiredThisWeek: number;
  nearExpiry: number;
  menuViews30d: number;
  approvedRevenue30d: number;
  newTenants30d: number;
  charts: {
    tenantsLast30Days: Array<{ date: string; count: number }>;
    menuViewsLast30Days: Array<{ date: string; views: number }>;
    paymentsLast30Days: Array<{
      date: string;
      count: number;
      approvedAmount: number;
    }>;
    subscriptionsByStatus: Array<{ status: string; count: number }>;
    paymentsByStatus: Array<{ status: string; count: number }>;
    paymentsByMethod: Array<{ method: string; count: number }>;
  };
};

async function fetchStats() {
  const { data } = await api.get<ApiSuccess<DashboardStats>>(
    "/admin/dashboard/stats",
  );
  return data.data;
}

function StatLinkCard({
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
    refetchInterval: 60_000,
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
          Live platform metrics from tenants, subscriptions, payments, and menu
          views. Refreshes every minute.
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
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatLinkCard label="Total Tenants" value={stats.data.totalTenants} />
            <StatLinkCard
              label="Active Subscriptions"
              value={stats.data.activeSubscriptions}
            />
            <StatLinkCard
              label="Pending Approvals"
              value={stats.data.pendingApprovals}
              emphasize
              to="/admin/approvals"
            />
            <StatLinkCard
              label="Pending Payments"
              value={stats.data.pendingPayments}
              emphasize
              to="/admin/payments"
            />
            <StatLinkCard
              label="Near Expiry (≤7 days)"
              value={stats.data.nearExpiry}
            />
            <StatLinkCard
              label="Expired This Week"
              value={stats.data.expiredThisWeek}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="New tenants (30d)"
              value={stats.data.newTenants30d}
            />
            <KpiCard
              label="Menu views (30d)"
              value={formatCompactNumber(stats.data.menuViews30d)}
            />
            <KpiCard
              label="Approved revenue (30d)"
              value={formatEtb(stats.data.approvedRevenue30d)}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="Tenant signups"
              subtitle="New restaurant accounts over the last 30 days"
            >
              <TrendAreaChart
                data={stats.data.charts.tenantsLast30Days}
                xKey="date"
                yKey="count"
                yLabel="Signups"
                emptyMessage="No new tenants in the last 30 days."
              />
            </ChartCard>

            <ChartCard
              title="Platform menu views"
              subtitle="Guest scans across all restaurants (30 days)"
            >
              <TrendAreaChart
                data={stats.data.charts.menuViewsLast30Days}
                xKey="date"
                yKey="views"
                yLabel="Views"
                emptyMessage="No menu views recorded in the last 30 days."
              />
            </ChartCard>
          </div>

          <ChartCard
            title="Payments activity"
            subtitle="Daily submissions vs approved amount (ETB)"
          >
            <DualAxisPaymentsChart data={stats.data.charts.paymentsLast30Days} />
          </ChartCard>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard title="Subscriptions" subtitle="By current status">
              <DistributionDonutChart
                data={stats.data.charts.subscriptionsByStatus}
                nameKey="status"
                valueKey="count"
                emptyMessage="No subscriptions yet."
              />
            </ChartCard>
            <ChartCard title="Payments" subtitle="By status">
              <DistributionDonutChart
                data={stats.data.charts.paymentsByStatus}
                nameKey="status"
                valueKey="count"
                emptyMessage="No payments yet."
              />
            </ChartCard>
            <ChartCard title="Payment methods" subtitle="All-time mix">
              <ComparisonBarChart
                data={stats.data.charts.paymentsByMethod.map((row) => ({
                  method: row.method.replaceAll("_", " "),
                  count: row.count,
                }))}
                xKey="method"
                yKey="count"
                yLabel="Payments"
                emptyMessage="No payment methods recorded."
              />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
