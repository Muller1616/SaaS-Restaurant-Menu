import { prisma } from "../../lib/prisma.js";

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

export async function getAdminDashboardStats() {
  const now = new Date();
  const inSevenDays = new Date(now);
  inSevenDays.setDate(inSevenDays.getDate() + 7);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const todayStart = startOfUtcDay(now);
  const windowDays = 30;
  const windowStart = addUtcDays(todayStart, -(windowDays - 1));

  const [
    totalTenants,
    activeSubscriptions,
    pendingApprovals,
    pendingPayments,
    expiredThisWeek,
    nearExpiry,
    tenantsInWindow,
    viewsInWindow,
    paymentsInWindow,
    subscriptionsByStatusRows,
    paymentsByStatusRows,
    paymentsByMethodRows,
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
    prisma.tenant.findMany({
      where: { createdAt: { gte: windowStart } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.menuView.findMany({
      where: { viewedAt: { gte: windowStart } },
      select: { viewedAt: true },
      orderBy: { viewedAt: "asc" },
    }),
    prisma.payment.findMany({
      where: { createdAt: { gte: windowStart } },
      select: { createdAt: true, amount: true, status: true },
      orderBy: { createdAt: "asc" },
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
  for (const row of tenantsInWindow) {
    const key = dayKey(row.createdAt);
    if (tenantCounts.has(key)) {
      tenantCounts.set(key, (tenantCounts.get(key) ?? 0) + 1);
    }
  }

  const viewCounts = emptyDailySeries(windowStart, windowDays);
  for (const row of viewsInWindow) {
    const key = dayKey(row.viewedAt);
    if (viewCounts.has(key)) {
      viewCounts.set(key, (viewCounts.get(key) ?? 0) + 1);
    }
  }

  const paymentCountSeries = emptyDailySeries(windowStart, windowDays);
  const paymentAmountSeries = emptyDailySeries(windowStart, windowDays);
  for (const row of paymentsInWindow) {
    const key = dayKey(row.createdAt);
    if (!paymentCountSeries.has(key)) continue;
    paymentCountSeries.set(key, (paymentCountSeries.get(key) ?? 0) + 1);
    if (row.status === "APPROVED") {
      paymentAmountSeries.set(
        key,
        (paymentAmountSeries.get(key) ?? 0) + Number(row.amount),
      );
    }
  }

  const paymentsLast30Days = [...paymentCountSeries.keys()].map((date) => ({
    date,
    count: paymentCountSeries.get(date) ?? 0,
    approvedAmount: paymentAmountSeries.get(date) ?? 0,
  }));

  const approvedRevenue30d = paymentsInWindow
    .filter((p) => p.status === "APPROVED")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    totalTenants,
    activeSubscriptions,
    pendingApprovals,
    pendingPayments,
    expiredThisWeek,
    nearExpiry,
    menuViews30d: viewsInWindow.length,
    approvedRevenue30d,
    newTenants30d: tenantsInWindow.length,
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
