import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";

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

function buildDailySeries(from: Date, days: number, timestamps: Date[]) {
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    counts.set(dayKey(addUtcDays(from, i)), 0);
  }
  for (const ts of timestamps) {
    const key = dayKey(ts);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([date, views]) => ({ date, views }));
}

export async function recordPublicMenuView(input: {
  tenantSlug: string;
  branchSlug?: string;
  userAgent?: string | null;
  referer?: string | null;
}) {
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

  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const windowDays = tier === "full" ? 30 : 7;
  const windowStart = addUtcDays(todayStart, -(windowDays - 1));
  const weekStart = addUtcDays(todayStart, -6);

  const [todayCount, weekCount, windowRows, totalCount] = await Promise.all([
    prisma.menuView.count({
      where: {
        branchId: branch.id,
        viewedAt: { gte: todayStart },
      },
    }),
    prisma.menuView.count({
      where: {
        branchId: branch.id,
        viewedAt: { gte: weekStart },
      },
    }),
    prisma.menuView.findMany({
      where: {
        branchId: branch.id,
        viewedAt: { gte: windowStart },
      },
      select: {
        viewedAt: true,
        ...(tier === "full" ? { userAgent: true } : {}),
      },
      orderBy: { viewedAt: "asc" },
    }),
    prisma.menuView.count({ where: { branchId: branch.id } }),
  ]);

  const daily = buildDailySeries(
    windowStart,
    windowDays,
    windowRows.map((row) => row.viewedAt),
  );
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
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, views: 0 }));
    const deviceCounts = new Map<string, number>();

    for (const row of windowRows) {
      hours[row.viewedAt.getUTCHours()]!.views += 1;
      const device = classifyUserAgent(
        "userAgent" in row ? (row.userAgent as string | null) : null,
      );
      deviceCounts.set(device, (deviceCounts.get(device) ?? 0) + 1);
    }
    byHour = hours;
    devices = ["Mobile", "Desktop", "Tablet", "Unknown"]
      .map((device) => ({ device, views: deviceCounts.get(device) ?? 0 }))
      .filter((row) => row.views > 0);
  }

  return {
    tier,
    branch: { id: branch.id, name: branch.name },
    totals: {
      allTime: totalCount,
      today: todayCount,
      last7Days: weekCount,
      windowDays,
      windowTotal: windowRows.length,
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
