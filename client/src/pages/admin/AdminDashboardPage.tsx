import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChartCard, KpiCard } from "../../components/charts/ChartCard";
import {
  ComparisonBarChart,
  DistributionDonutChart,
  DualAxisPaymentsChart,
  TrendAreaChart,
} from "../../components/charts/Charts";
import {
  chartTheme,
  formatCompactNumber,
} from "../../components/charts/chart-theme";
import { PageSkeleton } from "../../features/navigation/PageSkeleton";
import { formatEtb } from "../../lib/plans";
import { api, type ApiSuccess } from "../../lib/api";
import {
  paymentMethodLabel,
  paymentStatusLabel,
  subscriptionStatusLabel,
} from "../../lib/status-labels";

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
          ? "border-[rgba(91,141,239,0.45)] bg-[linear-gradient(145deg,rgba(91,141,239,0.18),rgba(18,26,23,0.96)_50%)]"
          : "border-[var(--line)] bg-[var(--panel)]",
        to ? "hover:-translate-y-0.5 hover:border-[rgba(91,141,239,0.7)]" : "",
      ].join(" ")}
    >
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">
        {value}
      </p>
      {emphasize && value > 0 && (
        <p
          className="mt-2 text-xs font-semibold tracking-wide uppercase"
          style={{ color: chartTheme.primarySoft }}
        >
          Action needed
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
          Live snapshot of restaurants, plans, payments, and menu views.
          Refreshes every minute.
        </p>
      </div>

      {stats.isLoading && !stats.data && <PageSkeleton rows={5} />}
      {stats.isError && (
        <p className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          Couldn't load dashboard stats.
        </p>
      )}

      {stats.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatLinkCard label="Total restaurants" value={stats.data.totalTenants} />
            <StatLinkCard
              label="Active subscriptions"
              value={stats.data.activeSubscriptions}
            />
            <StatLinkCard
              label="Pending approvals"
              value={stats.data.pendingApprovals}
              emphasize
              to="/admin/approvals"
            />
            <StatLinkCard
              label="Pending payments"
              value={stats.data.pendingPayments}
              emphasize
              to="/admin/payments"
            />
            <StatLinkCard
              label="Near expiry (≤7 days)"
              value={stats.data.nearExpiry}
            />
            <StatLinkCard
              label="Expired this week"
              value={stats.data.expiredThisWeek}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="New restaurants (30d)"
              value={stats.data.newTenants30d}
              accent="primary"
            />
            <KpiCard
              label="Menu views (30d)"
              value={formatCompactNumber(stats.data.menuViews30d)}
              accent="secondary"
            />
            <KpiCard
              label="Confirmed revenue (30d)"
              value={formatEtb(stats.data.approvedRevenue30d)}
              accent="success"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="Restaurant signups"
              subtitle="New restaurant accounts over the last 30 days"
            >
              <TrendAreaChart
                data={stats.data.charts.tenantsLast30Days}
                xKey="date"
                yKey="count"
                yLabel="Signups"
                color={chartTheme.primary}
                emptyMessage="No new restaurants signed up in the last 30 days."
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
                color={chartTheme.secondary}
                emptyMessage="No menu views yet — guests will show up once QR codes are shared."
              />
            </ChartCard>
          </div>

          <ChartCard
            title="Payments activity"
            subtitle="Daily submissions vs confirmed amount (ETB)"
          >
            <DualAxisPaymentsChart data={stats.data.charts.paymentsLast30Days} />
          </ChartCard>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard title="Subscriptions" subtitle="By current status">
              <DistributionDonutChart
                data={stats.data.charts.subscriptionsByStatus.map((row) => ({
                  status: subscriptionStatusLabel(row.status),
                  count: row.count,
                }))}
                nameKey="status"
                valueKey="count"
                emptyMessage="No subscriptions to chart yet."
              />
            </ChartCard>
            <ChartCard title="Payments" subtitle="By status">
              <DistributionDonutChart
                data={stats.data.charts.paymentsByStatus.map((row) => ({
                  status: paymentStatusLabel(row.status),
                  count: row.count,
                }))}
                nameKey="status"
                valueKey="count"
                emptyMessage="No payments to chart yet."
              />
            </ChartCard>
            <ChartCard title="Payment methods" subtitle="All-time mix">
              <ComparisonBarChart
                data={stats.data.charts.paymentsByMethod.map((row) => ({
                  method: paymentMethodLabel(row.method),
                  count: row.count,
                }))}
                xKey="method"
                yKey="count"
                yLabel="Payments"
                colorByCategory
                emptyMessage="No payment methods recorded yet."
              />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
