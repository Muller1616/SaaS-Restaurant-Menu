import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link } from "react-router-dom";
import { ChartCard, KpiCard } from "../../components/charts/ChartCard";
import {
  ComparisonBarChart,
  DistributionDonutChart,
  TrendAreaChart,
} from "../../components/charts/Charts";
import { chartTheme } from "../../components/charts/chart-theme";
import { PageSkeleton } from "../../features/navigation/PageSkeleton";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { tenantPortalPath } from "../../lib/tenant-paths";
import { api, type ApiSuccess } from "../../lib/api";

type AnalyticsPayload = {
  tier: "basic" | "full";
  branch: { id: string; name: string };
  totals: {
    allTime: number;
    today: number;
    last7Days: number;
    windowDays: number;
    windowTotal: number;
    avgPerDay: number;
  };
  peakDay: { date: string; views: number };
  daily: Array<{ date: string; views: number }>;
  byHour: Array<{ hour: number; views: number }> | null;
  devices: Array<{ device: string; views: number }> | null;
};

async function fetchAnalytics() {
  const { data } = await api.get<ApiSuccess<AnalyticsPayload>>(
    "/tenant/analytics",
  );
  return data.data;
}

export function TenantAnalyticsPage() {
  const { currentBranchId, tenant } = useTenantAuth();
  const portal = (...segments: string[]) => tenantPortalPath(tenant?.slug ?? "", ...segments);
  const analyticsLevel = tenant?.selectedPlan.features?.analytics ?? "none";
  const locked = analyticsLevel === "none";

  const query = useQuery({
    queryKey: ["tenant", "analytics", currentBranchId],
    queryFn: fetchAnalytics,
    enabled: Boolean(currentBranchId) && !locked,
    retry: false,
    refetchInterval: locked ? false : 30_000,
  });

  const lockedMessage = axios.isAxiosError(query.error)
    ? (query.error.response?.data?.message as string) ||
      "Analytics is locked on your plan."
    : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Insights
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-4xl text-white">
          Analytics
        </h2>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Live guest scans for{" "}
          <span className="text-white">
            {query.data?.branch.name ?? "this branch"}
          </span>
          .{" "}
          {analyticsLevel === "full"
            ? "Full plan: 30-day trends, hour-of-day, and device mix."
            : analyticsLevel === "basic"
              ? "Basic plan: 7-day trends."
              : "Upgrade to Basic or higher to unlock guest scan insights."}{" "}
          Auto-refreshes every 30 seconds.
        </p>
      </div>

      {locked && (
        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6">
          <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
            Analytics locked on Free
          </h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Upgrade to Basic for 7-day views, or Popular / Premium for 30-day
            trends plus hour and device breakdowns.
          </p>
          <Link
            to={portal("subscription")}
            className="mt-5 inline-flex rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)]"
          >
            View plans
          </Link>
        </section>
      )}

      {!locked && query.isLoading && !query.data && <PageSkeleton rows={5} />}

      {!locked && query.isError && (
        <div className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {lockedMessage ?? "Could not load analytics."}
        </div>
      )}

      {query.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Today"
              value={query.data.totals.today}
              accent="primary"
              emphasize
            />
            <KpiCard
              label="Last 7 days"
              value={query.data.totals.last7Days}
              accent="secondary"
            />
            <KpiCard
              label={`${query.data.totals.windowDays}-day total`}
              value={query.data.totals.windowTotal}
              accent="accent"
            />
            <KpiCard
              label="All time"
              value={query.data.totals.allTime}
              accent="success"
            />
          </div>

          <ChartCard
            title="Daily views"
            subtitle={`Peak ${query.data.peakDay.date}: ${query.data.peakDay.views} · avg ${query.data.totals.avgPerDay}/day`}
            action={
              <span
                className="rounded-full border px-3 py-1 text-xs uppercase tracking-wide"
                style={{
                  borderColor: "rgba(91,141,239,0.35)",
                  color: chartTheme.primarySoft,
                  background: "rgba(91,141,239,0.12)",
                }}
              >
                {query.data.tier}
              </span>
            }
          >
            <TrendAreaChart
              data={query.data.daily}
              xKey="date"
              yKey="views"
              yLabel="Views"
              color={chartTheme.primary}
              emptyMessage="No guest views in this window yet. Share your QR to start collecting scans."
            />
          </ChartCard>

          {query.data.byHour && (
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard
                title="Views by hour (UTC)"
                subtitle="When guests open your menu across the day"
              >
                <ComparisonBarChart
                  data={query.data.byHour.map((slot) => ({
                    hour: `${String(slot.hour).padStart(2, "0")}:00`,
                    views: slot.views,
                  }))}
                  xKey="hour"
                  yKey="views"
                  yLabel="Views"
                  color={chartTheme.secondary}
                  emptyMessage="No hourly data yet."
                />
              </ChartCard>

              <ChartCard
                title="Devices"
                subtitle="Guest device mix from recorded user agents"
              >
                <DistributionDonutChart
                  data={query.data.devices ?? []}
                  nameKey="device"
                  valueKey="views"
                  emptyMessage="Device breakdown will appear once guests scan your menu."
                />
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
