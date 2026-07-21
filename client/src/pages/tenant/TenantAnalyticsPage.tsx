import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link } from "react-router-dom";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
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
};

async function fetchAnalytics() {
  const { data } = await api.get<ApiSuccess<AnalyticsPayload>>(
    "/tenant/analytics",
  );
  return data.data;
}

export function TenantAnalyticsPage() {
  const { currentBranchId, tenant } = useTenantAuth();
  const analyticsLevel = tenant?.selectedPlan.features?.analytics ?? "none";
  const locked = analyticsLevel === "none";

  const query = useQuery({
    queryKey: ["tenant", "analytics", currentBranchId],
    queryFn: fetchAnalytics,
    enabled: Boolean(currentBranchId) && !locked,
    retry: false,
  });

  const maxDaily = Math.max(1, ...(query.data?.daily.map((d) => d.views) ?? [1]));
  const maxHour = Math.max(
    1,
    ...(query.data?.byHour?.map((h) => h.views) ?? [1]),
  );

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
          Guest scans and menu opens for{" "}
          <span className="text-white">
            {query.data?.branch.name ?? "this branch"}
          </span>
          .{" "}
          {analyticsLevel === "full"
            ? "Full plan: 30-day trends + hour-of-day."
            : analyticsLevel === "basic"
              ? "Basic plan: 7-day trends."
              : "Upgrade to Basic or higher to unlock."}
        </p>
      </div>

      {locked && (
        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6">
          <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
            Analytics locked
          </h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Free plans do not include analytics. Upgrade to Basic for 7-day
            views, or Popular/Premium for 30-day + hour breakdown.
          </p>
          <Link
            to="/tenant/subscription"
            className="mt-5 inline-flex rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)]"
          >
            View subscription plans
          </Link>
        </section>
      )}

      {!locked && query.isLoading && (
        <p className="text-[var(--muted)]">Loading analytics…</p>
      )}

      {!locked && query.isError && (
        <div className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {lockedMessage ?? "Could not load analytics."}
        </div>
      )}

      {query.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Today" value={query.data.totals.today} />
            <StatCard label="Last 7 days" value={query.data.totals.last7Days} />
            <StatCard
              label={`${query.data.totals.windowDays}-day total`}
              value={query.data.totals.windowTotal}
            />
            <StatCard label="All time" value={query.data.totals.allTime} />
          </div>

          <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
                  Daily views
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Peak {query.data.peakDay.date}: {query.data.peakDay.views} ·
                  avg {query.data.totals.avgPerDay}/day
                </p>
              </div>
              <span className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-wide text-[var(--gold)]">
                {query.data.tier}
              </span>
            </div>

            <div className="mt-6 flex h-48 items-end gap-1.5 sm:gap-2">
              {query.data.daily.map((day) => (
                <div
                  key={day.date}
                  className="flex min-w-0 flex-1 flex-col items-center gap-2"
                  title={`${day.date}: ${day.views}`}
                >
                  <div
                    className="w-full rounded-t-md bg-[linear-gradient(180deg,var(--gold-soft),var(--gold))]"
                    style={{
                      height: `${Math.max(4, (day.views / maxDaily) * 100)}%`,
                    }}
                  />
                  <span className="truncate text-[10px] text-[var(--muted)]">
                    {day.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {query.data.byHour && (
            <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6">
              <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
                Views by hour (UTC)
              </h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Full analytics — when guests open your menu across the day.
              </p>
              <div className="mt-6 flex h-40 items-end gap-1">
                {query.data.byHour.map((slot) => (
                  <div
                    key={slot.hour}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    title={`${slot.hour}:00 — ${slot.views}`}
                  >
                    <div
                      className="w-full rounded-t bg-[rgba(212,165,116,0.75)]"
                      style={{
                        height: `${Math.max(3, (slot.views / maxHour) * 100)}%`,
                      }}
                    />
                    {slot.hour % 3 === 0 && (
                      <span className="text-[9px] text-[var(--muted)]">
                        {slot.hour}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">
        {value}
      </p>
    </div>
  );
}
