import { prisma } from "../../lib/prisma.js";
import { cacheAside, CacheKeys, CacheTtl } from "../../lib/cache/index.js";

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function emptyDailySeries(from: Date, days: number) {
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    counts.set(dayKey(addUtcDays(from, i)), 0);
  }
  return counts;
}

function seriesFromMap(counts: Map<string, number>, valueKey: string) {
  return [...counts.entries()].map(([date, value]) => ({
    date,
    [valueKey]: value,
  }));
}

function fillDailyCounts(
  series: Map<string, number>,
  rows: Array<{ day: Date; count: bigint | number }>,
) {
  for (const row of rows) {
    const key = dayKey(new Date(row.day));
    if (series.has(key)) {
      series.set(key, Number(row.count));
    }
  }
}

export async function getAdminDashboardStats() {
  return cacheAside(
    CacheKeys.adminDashboard(),
    CacheTtl.adminDashboard,
    loadAdminDashboardStats,
  );
}

async function loadAdminDashboardStats() {
  const now = new Date();
  const inSevenDays = new Date(now);
  inSevenDays.setDate(inSevenDays.getDate() + 7);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const todayStart = startOfUtcDay(now);
  const windowDays = 30;
  const windowStart = addUtcDays(todayStart, -(windowDays - 1));

  // Split into two waves to avoid exhausting the Prisma connection pool
  // (12 parallel queries on a slow remote DB caused pool timeouts → 500s).
  const [
    totalTenants,
    activeSubscriptions,
    pendingApprovals,
    pendingPayments,
    expiredThisWeek,
    nearExpiry,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.tenant.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.subscription.count({
      where: {
        status: "EXPIRED",
        updatedAt: { gte: weekStart },
      },
    }),
    prisma.subscription.count({
      where: {
        status: "ACTIVE",
        expiryDate: {
          not: null,
          gte: now,
          lte: inSevenDays,
        },
      },
    }),
  ]);

  const [
    tenantDailyRows,
    viewDailyRows,
    paymentDailyRows,
    approvedRevenueRow,
    subscriptionsByStatusRows,
    paymentsByStatusRows,
    paymentsByMethodRows,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT date_trunc('day', "created_at" AT TIME ZONE 'UTC') AS day,
             COUNT(*)::bigint AS count
      FROM tenants
      WHERE "created_at" >= ${windowStart}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT date_trunc('day', "viewed_at" AT TIME ZONE 'UTC') AS day,
             COUNT(*)::bigint AS count
      FROM menu_views
      WHERE "viewed_at" >= ${windowStart}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<
      Array<{ day: Date; count: bigint; approved_amount: unknown }>
    >`
      SELECT date_trunc('day', "created_at" AT TIME ZONE 'UTC') AS day,
             COUNT(*)::bigint AS count,
             COALESCE(
               SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END),
               0
             ) AS approved_amount
      FROM payments
      WHERE "created_at" >= ${windowStart}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.payment.aggregate({
      where: {
        status: "APPROVED",
        createdAt: { gte: windowStart },
      },
      _sum: { amount: true },
    }),
    prisma.subscription.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ["paymentMethod"],
      _count: { _all: true },
    }),
  ]);

  const tenantCounts = emptyDailySeries(windowStart, windowDays);
  fillDailyCounts(tenantCounts, tenantDailyRows);

  const viewCounts = emptyDailySeries(windowStart, windowDays);
  fillDailyCounts(viewCounts, viewDailyRows);

  const paymentCountSeries = emptyDailySeries(windowStart, windowDays);
  const paymentAmountSeries = emptyDailySeries(windowStart, windowDays);
  let menuViews30d = 0;
  let newTenants30d = 0;
  for (const row of viewDailyRows) {
    menuViews30d += Number(row.count);
  }
  for (const row of tenantDailyRows) {
    newTenants30d += Number(row.count);
  }
  for (const row of paymentDailyRows) {
    const key = dayKey(new Date(row.day));
    if (!paymentCountSeries.has(key)) continue;
    paymentCountSeries.set(key, Number(row.count));
    paymentAmountSeries.set(key, Number(row.approved_amount ?? 0));
  }

  const paymentsLast30Days = [...paymentCountSeries.keys()].map((date) => ({
    date,
    count: paymentCountSeries.get(date) ?? 0,
    approvedAmount: paymentAmountSeries.get(date) ?? 0,
  }));

  const approvedRevenue30d = Number(approvedRevenueRow._sum.amount ?? 0);

  return {
    totalTenants,
    activeSubscriptions,
    pendingApprovals,
    pendingPayments,
    expiredThisWeek,
    nearExpiry,
    menuViews30d,
    approvedRevenue30d,
    newTenants30d,
    charts: {
      tenantsLast30Days: seriesFromMap(tenantCounts, "count") as Array<{
        date: string;
        count: number;
      }>,
      menuViewsLast30Days: seriesFromMap(viewCounts, "views") as Array<{
        date: string;
        views: number;
      }>,
      paymentsLast30Days,
      subscriptionsByStatus: subscriptionsByStatusRows.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      paymentsByStatus: paymentsByStatusRows.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      paymentsByMethod: paymentsByMethodRows.map((row) => ({
        method: row.paymentMethod,
        count: row._count._all,
      })),
    },
  };
}
