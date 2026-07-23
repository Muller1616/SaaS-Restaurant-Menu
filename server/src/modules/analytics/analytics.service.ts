import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";
import { cacheAside, CacheKeys, CacheTtl } from "../../lib/cache/index.js";

export type AnalyticsTier = "basic" | "full" | "none";

export function resolveAnalyticsTier(features: unknown): AnalyticsTier {
  const value =
    features &&
    typeof features === "object" &&
    "analytics" in features
      ? String((features as { analytics?: string }).analytics ?? "none")
      : "none";
  if (value === "full") return "full";
  if (value === "basic") return "basic";
  return "none";
}

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

function buildDailySeries(
  from: Date,
  days: number,
  dayCounts: Map<string, number>,
) {
  const series: Array<{ date: string; views: number }> = [];
  for (let i = 0; i < days; i += 1) {
    const key = dayKey(addUtcDays(from, i));
    series.push({ date: key, views: dayCounts.get(key) ?? 0 });
  }
  return series;
}

export async function recordPublicMenuView(input: {
  publicQrId?: string;
  tenantSlug?: string;
  branchSlug?: string;
  userAgent?: string | null;
  referer?: string | null;
}) {
  if (input.publicQrId) {
    const branch = await prisma.branch.findFirst({
      where: {
        publicQrId: input.publicQrId,
        deletedAt: null,
        isActive: true,
      },
      include: {
        tenant: { select: { id: true, status: true } },
        subscription: { select: { status: true } },
      },
    });
    if (
      !branch ||
      branch.tenant.status === "REJECTED" ||
      branch.tenant.status === "SUSPENDED"
    ) {
      throw new AppError(404, "Menu not found");
    }
    const status = branch.subscription?.status;
    if (!status || ["EXPIRED", "SUSPENDED", "CANCELLED"].includes(status)) {
      return { recorded: false as const };
    }
    await prisma.menuView.create({
      data: {
        tenantId: branch.tenant.id,
        branchId: branch.id,
        userAgent: input.userAgent?.slice(0, 255) || null,
        referer: input.referer?.slice(0, 500) || null,
      },
    });
    return { recorded: true as const };
  }

  if (!input.tenantSlug) {
    throw new AppError(400, "Menu not found");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: input.tenantSlug },
    select: { id: true, status: true },
  });
  if (!tenant || tenant.status === "REJECTED" || tenant.status === "SUSPENDED") {
    throw new AppError(404, "Menu not found");
  }

  const branch = await prisma.branch.findFirst({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
      isActive: true,
      ...(input.branchSlug ? { slug: input.branchSlug } : {}),
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      subscription: { select: { status: true } },
    },
  });

  if (!branch) throw new AppError(404, "Menu not found");

  const status = branch.subscription?.status;
  if (!status || ["EXPIRED", "SUSPENDED", "CANCELLED"].includes(status)) {
    // Still 204-ish success path: don't track unavailable menus
    return { recorded: false as const };
  }

  await prisma.menuView.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      userAgent: input.userAgent?.slice(0, 255) || null,
      referer: input.referer?.slice(0, 500) || null,
    },
  });

  return { recorded: true as const };
}

export async function getBranchAnalytics(input: {
  tenantId: string;
  branchId: string;
}) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: input.branchId,
      tenantId: input.tenantId,
      deletedAt: null,
    },
    include: {
      subscription: { include: { plan: true } },
      tenant: { select: { selectedPlan: true } },
    },
  });

  if (!branch) throw new AppError(404, "Branch not found");

  const features =
    branch.subscription?.plan.features ?? branch.tenant.selectedPlan.features;
  const tier = resolveAnalyticsTier(features);

  if (tier === "none") {
    throw new AppError(
      403,
      "Analytics is available on Basic, Popular, and Premium plans.",
      { code: "ANALYTICS_LOCKED" },
    );
  }

  return cacheAside(
    CacheKeys.branchAnalytics(branch.id, tier),
    CacheTtl.branchAnalytics,
    () => loadBranchAnalytics(branch.id, branch.name, tier),
  );
}

async function loadBranchAnalytics(
  branchId: string,
  branchName: string,
  tier: Exclude<AnalyticsTier, "none">,
) {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const windowDays = tier === "full" ? 30 : 7;
  const windowStart = addUtcDays(todayStart, -(windowDays - 1));
  const weekStart = addUtcDays(todayStart, -6);

  const [todayCount, weekCount, totalCount, dailyRows] = await Promise.all([
    prisma.menuView.count({
      where: { branchId, viewedAt: { gte: todayStart } },
    }),
    prisma.menuView.count({
      where: { branchId, viewedAt: { gte: weekStart } },
    }),
    prisma.menuView.count({ where: { branchId } }),
    prisma.$queryRaw<Array<{ day: Date; views: bigint }>>`
      SELECT date_trunc('day', "viewedAt" AT TIME ZONE 'UTC') AS day,
             COUNT(*)::bigint AS views
      FROM "MenuView"
      WHERE "branchId" = ${branchId}
        AND "viewedAt" >= ${windowStart}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  ]);

  const dayCounts = new Map<string, number>();
  let windowTotal = 0;
  for (const row of dailyRows) {
    const views = Number(row.views);
    dayCounts.set(dayKey(new Date(row.day)), views);
    windowTotal += views;
  }

  const daily = buildDailySeries(windowStart, windowDays, dayCounts);
  const peak = daily.reduce(
    (best, row) => (row.views > best.views ? row : best),
    daily[0] ?? { date: dayKey(todayStart), views: 0 },
  );
  const avgPerDay =
    daily.length === 0
      ? 0
      : Math.round(
          (daily.reduce((sum, row) => sum + row.views, 0) / daily.length) * 10,
        ) / 10;

  let byHour: Array<{ hour: number; views: number }> | null = null;
  let devices: Array<{ device: string; views: number }> | null = null;

  if (tier === "full") {
    const [hourRows, uaRows] = await Promise.all([
      prisma.$queryRaw<Array<{ hour: number; views: bigint }>>`
        SELECT EXTRACT(HOUR FROM ("viewedAt" AT TIME ZONE 'UTC'))::int AS hour,
               COUNT(*)::bigint AS views
        FROM "MenuView"
        WHERE "branchId" = ${branchId}
          AND "viewedAt" >= ${windowStart}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.menuView.findMany({
        where: { branchId, viewedAt: { gte: windowStart } },
        select: { userAgent: true },
      }),
    ]);

    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, views: 0 }));
    for (const row of hourRows) {
      hours[row.hour]!.views = Number(row.views);
    }
    byHour = hours;

    const deviceCounts = new Map<string, number>();
    for (const row of uaRows) {
      const device = classifyUserAgent(row.userAgent);
      deviceCounts.set(device, (deviceCounts.get(device) ?? 0) + 1);
    }
    devices = ["Mobile", "Desktop", "Tablet", "Unknown"]
      .map((device) => ({ device, views: deviceCounts.get(device) ?? 0 }))
      .filter((row) => row.views > 0);
  }

  return {
    tier,
    branch: { id: branchId, name: branchName },
    totals: {
      allTime: totalCount,
      today: todayCount,
      last7Days: weekCount,
      windowDays,
      windowTotal,
      avgPerDay,
    },
    peakDay: peak,
    daily,
    byHour,
    devices,
  };
}

function classifyUserAgent(userAgent: string | null) {
  if (!userAgent) return "Unknown";
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return "Tablet";
  if (/mobi|android|iphone|ipod/.test(ua)) return "Mobile";
  return "Desktop";
}
