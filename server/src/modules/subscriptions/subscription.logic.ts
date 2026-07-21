import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { recordSubscriptionEvent } from "./subscription-history.js";
import { notifyTenant } from "../../services/notify.js";

const GRACE_DAYS = 3;
const NEAR_EXPIRY_DAYS = 7;
/** FR-6.1 — trial length after registration approval. */
export const TRIAL_DAYS = 14;

export type DisplaySubscriptionStatus =
  | SubscriptionStatus
  | "NEARLY_EXPIRED";

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function daysBetween(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function computeSubscriptionView(input: {
  status: SubscriptionStatus;
  expiryDate: Date | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  if (input.status === "SUSPENDED" || input.status === "CANCELLED") {
    return {
      status: input.status as DisplaySubscriptionStatus,
      storedStatus: input.status,
      daysRemaining: input.expiryDate
        ? daysBetween(now, input.expiryDate)
        : null,
      inGrace: false,
      isExpired: true,
      isTrial: false,
      canEdit: false,
      showRenew: input.status === "CANCELLED",
    };
  }

  // Free / no expiry (post-trial Free ACTIVE)
  if (!input.expiryDate) {
    return {
      status: "ACTIVE" as DisplaySubscriptionStatus,
      storedStatus: "ACTIVE" as SubscriptionStatus,
      daysRemaining: null as number | null,
      inGrace: false,
      isExpired: false,
      isTrial: false,
      canEdit: true,
      showRenew: false,
    };
  }

  const daysRemaining = daysBetween(now, input.expiryDate);

  // FR-6.1 TRIAL window — full access until trial expiry
  if (input.status === "TRIAL") {
    if (now <= input.expiryDate) {
      const nearly = daysRemaining <= NEAR_EXPIRY_DAYS;
      return {
        status: (nearly
          ? "NEARLY_EXPIRED"
          : "TRIAL") as DisplaySubscriptionStatus,
        storedStatus: "TRIAL" as SubscriptionStatus,
        daysRemaining,
        inGrace: false,
        isExpired: false,
        isTrial: true,
        canEdit: true,
        showRenew: false,
      };
    }
    // Past trial — sync will convert; interim read-only
    return {
      status: "EXPIRED" as DisplaySubscriptionStatus,
      storedStatus: "TRIAL" as SubscriptionStatus,
      daysRemaining,
      inGrace: false,
      isExpired: true,
      isTrial: true,
      canEdit: false,
      showRenew: true,
    };
  }

  if (now <= input.expiryDate) {
    const nearly = daysRemaining <= NEAR_EXPIRY_DAYS;
    return {
      status: (nearly ? "NEARLY_EXPIRED" : "ACTIVE") as DisplaySubscriptionStatus,
      storedStatus: "ACTIVE" as SubscriptionStatus,
      daysRemaining,
      inGrace: false,
      isExpired: false,
      isTrial: false,
      canEdit: true,
      showRenew: true,
    };
  }

  const graceEnd = new Date(input.expiryDate);
  graceEnd.setDate(graceEnd.getDate() + GRACE_DAYS);

  if (now <= graceEnd) {
    return {
      status: "GRACE_PERIOD" as DisplaySubscriptionStatus,
      storedStatus: "GRACE_PERIOD" as SubscriptionStatus,
      daysRemaining,
      inGrace: true,
      isExpired: false,
      isTrial: false,
      canEdit: false,
      showRenew: true,
    };
  }

  return {
    status: "EXPIRED" as DisplaySubscriptionStatus,
    storedStatus: "EXPIRED" as SubscriptionStatus,
    daysRemaining,
    inGrace: false,
    isExpired: true,
    isTrial: false,
    canEdit: false,
    showRenew: true,
  };
}

/**
 * Persist computed status. Converts ended TRIAL → ACTIVE (Free forever or paid months).
 */
export async function syncSubscriptionStatus(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: true,
      branch: {
        include: {
          tenant: {
            select: { id: true, fullName: true, businessName: true },
          },
        },
      },
    },
  });
  if (!subscription) return null;

  const now = new Date();

  if (
    subscription.status === "TRIAL" &&
    subscription.expiryDate &&
    now > subscription.expiryDate
  ) {
    const isFree = Number(subscription.plan.priceMonthly) === 0;
    let nextExpiry: Date | null = null;
    let months = 0;

    if (!isFree) {
      const payment = await prisma.payment.findFirst({
        where: {
          branchId: subscription.branchId,
          status: "APPROVED",
        },
        orderBy: { createdAt: "asc" },
      });
      months = payment?.durationMonths ?? 1;
      nextExpiry = addMonths(now, months);
    }

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        startDate: now,
        expiryDate: nextExpiry,
      },
      include: { plan: true, branch: true },
    });

    await recordSubscriptionEvent({
      subscriptionId: subscription.id,
      branchId: subscription.branchId,
      tenantId: subscription.branch.tenant.id,
      kind: "STATUS_CHANGED",
      fromStatus: "TRIAL",
      toStatus: "ACTIVE",
      summary: isFree
        ? "14-day trial ended — Free plan is now active with no expiry."
        : `14-day trial ended — paid subscription active for ${months} month(s).`,
      meta: {
        trialEnded: true,
        expiryDate: nextExpiry?.toISOString() ?? null,
      },
    });

    await notifyTenant({
      tenantId: subscription.branch.tenant.id,
      type: "SUBSCRIPTION",
      title: "Trial ended",
      message: isFree
        ? `${subscription.branch.name}: your 14-day trial ended. You remain on the Free plan.`
        : `${subscription.branch.name}: your trial ended. Paid access continues until ${nextExpiry!.toDateString()}.`,
      email: {
        subject: "KitchenOS: your trial has ended",
        text: `Hi ${subscription.branch.tenant.fullName},

Your 14-day KitchenOS trial for ${subscription.branch.name} (${subscription.branch.tenant.businessName}) has ended.

${
  isFree
    ? "You are now on the Free plan with ongoing access (plan limits apply)."
    : `Your paid subscription is now active until ${nextExpiry!.toDateString()}.`
}

KitchenOS Team`,
      },
    });

    return updated;
  }

  const view = computeSubscriptionView({
    status: subscription.status,
    expiryDate: subscription.expiryDate,
    now,
  });

  if (
    subscription.status !== "SUSPENDED" &&
    subscription.status !== "CANCELLED" &&
    subscription.status !== "TRIAL" &&
    subscription.status !== view.storedStatus
  ) {
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: view.storedStatus },
      include: { plan: true, branch: true },
    });
  }

  return prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, branch: true },
  });
}
