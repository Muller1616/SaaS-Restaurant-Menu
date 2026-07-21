import { prisma } from "../../lib/prisma.js";

export async function getAdminDashboardStats() {
  const now = new Date();
  const inSevenDays = new Date(now);
  inSevenDays.setDate(inSevenDays.getDate() + 7);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const [
    totalTenants,
    activeSubscriptions,
    pendingApprovals,
    pendingPayments,
    expiredThisWeek,
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
  ]);

  const nearExpiry = await prisma.subscription.count({
    where: {
      status: "ACTIVE",
      expiryDate: {
        not: null,
        gte: now,
        lte: inSevenDays,
      },
    },
  });

  return {
    totalTenants,
    activeSubscriptions,
    pendingApprovals,
    pendingPayments,
    expiredThisWeek,
    nearExpiry,
  };
}
