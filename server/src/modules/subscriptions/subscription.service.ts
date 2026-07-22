import { z } from "zod";
import { env } from "../../config/env.js";
import { logActivity } from "../../lib/activity-log.js";
import { logger } from "../../lib/logger.js";
import { parsePageParams, toPageResult } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";
import { notifyTenant } from "../../services/notify.js";
import { recordSubscriptionEvent } from "./subscription-history.js";
import {
  addDays,
  addMonths,
  computeSubscriptionView,
  syncSubscriptionStatus,
} from "./subscription.logic.js";

export const RETENTION_DAYS = 30;

export const renewSchema = z.object({
  durationMonths: z.coerce
    .number()
    .int()
    .refine((v) => [1, 3, 6, 12].includes(v), {
      message: "Duration must be 1, 3, 6, or 12 months",
    }),
  paymentMethod: z.enum(["BANK_TRANSFER", "TELEBIRR", "CASH"]),
  referenceNumber: z.string().trim().min(2, "Reference number is required"),
  notes: z.string().trim().optional(),
});

export async function getBranchSubscription(tenantId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId, deletedAt: null },
    include: {
      tenant: { select: { businessName: true, email: true, fullName: true } },
      subscription: { include: { plan: true } },
    },
  });

  if (!branch?.subscription) {
    throw new AppError(404, "Subscription not found for this branch");
  }

  await syncSubscriptionStatus(branch.subscription.id);
  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: branch.subscription.id },
    include: { plan: true },
  });

  const view = computeSubscriptionView({
    status: subscription.status,
    expiryDate: subscription.expiryDate,
  });

  const isFree = Number(subscription.plan.priceMonthly) === 0;
  const cancelledAt = subscription.cancelledAt;
  const retainUntil =
    subscription.status === "CANCELLED" && cancelledAt
      ? addDays(cancelledAt, RETENTION_DAYS)
      : null;
  const retentionDaysLeft =
    retainUntil != null
      ? Math.max(
          0,
          Math.ceil(
            (retainUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          ),
        )
      : null;

  const canCancel = ![
    "CANCELLED",
    "SUSPENDED",
  ].includes(subscription.status);

  return {
    branch: {
      id: branch.id,
      name: branch.name,
      location: branch.location,
    },
    plan: {
      id: subscription.plan.id,
      name: subscription.plan.name,
      slug: subscription.plan.slug,
      priceMonthly: subscription.plan.priceMonthly.toString(),
      maxBranches: subscription.plan.maxBranches,
      maxItems: subscription.plan.maxItems,
    },
    status: view.status,
    storedStatus: subscription.status,
    startDate: subscription.startDate,
    expiryDate: subscription.expiryDate,
    daysRemaining: view.daysRemaining,
    canEdit: view.canEdit,
    showRenew: !isFree && view.showRenew,
    isFree,
    isTrial: view.isTrial,
    canCancel,
    cancelledAt,
    retainUntil,
    retentionDaysLeft,
    retentionPurgedAt: subscription.retentionPurgedAt,
    renewalOptions: [1, 3, 6, 12].map((months) => ({
      months,
      label:
        months === 1
          ? "1 Month"
          : months === 12
            ? "1 Year"
            : `${months} Months`,
      amount: (Number(subscription.plan.priceMonthly) * months).toFixed(2),
    })),
  };
}

export async function cancelBranchSubscription(input: {
  tenantId: string;
  branchId: string;
}) {
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, tenantId: input.tenantId, deletedAt: null },
    include: {
      subscription: { include: { plan: true } },
      tenant: { select: { fullName: true, businessName: true } },
    },
  });

  if (!branch?.subscription) {
    throw new AppError(404, "Subscription not found");
  }

  if (
    branch.subscription.status === "CANCELLED" ||
    branch.subscription.status === "SUSPENDED"
  ) {
    throw new AppError(
      400,
      branch.subscription.status === "CANCELLED"
        ? "Subscription is already cancelled"
        : "Suspended subscriptions cannot be cancelled by the tenant",
    );
  }

  const now = new Date();
  const updated = await prisma.subscription.update({
    where: { id: branch.subscription.id },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      retentionPurgedAt: null,
    },
    include: { plan: true },
  });

  const retainUntil = addDays(now, RETENTION_DAYS);

  await notifyTenant({
    tenantId: input.tenantId,
    type: "SUBSCRIPTION",
    title: "Subscription cancelled",
    message: `${branch.name}: subscription cancelled. Menu data is retained until ${retainUntil.toDateString()}, then removed. You can renew anytime before then.`,
    email: {
      subject: "KitchenOS subscription cancelled",
      text: `Hi ${branch.tenant.fullName},

Your KitchenOS subscription for ${branch.name} (${branch.tenant.businessName}) has been cancelled.

Your menu data will be retained until ${retainUntil.toDateString()} (${RETENTION_DAYS} days), then removed.

You can renew from your dashboard to restore access before then:
${env.clientUrl}/tenant/subscription

KitchenOS Team`,
    },
  });

  await logActivity({
    userType: "TENANT",
    userId: input.tenantId,
    action: "CANCEL",
    entityType: "subscription",
    entityId: updated.id,
    details: {
      branchId: branch.id,
      retainUntil: retainUntil.toISOString(),
    },
  });

  await recordSubscriptionEvent({
    subscriptionId: updated.id,
    branchId: branch.id,
    tenantId: input.tenantId,
    kind: "CANCELLED",
    fromStatus: branch.subscription.status,
    toStatus: "CANCELLED",
    summary: `Tenant cancelled subscription. Data retained until ${retainUntil.toDateString()}.`,
    actorType: "TENANT",
    actorId: input.tenantId,
    meta: { retainUntil: retainUntil.toISOString() },
  });

  return getBranchSubscription(input.tenantId, input.branchId);
}

export async function submitRenewalPayment(input: {
  tenantId: string;
  branchId: string;
  durationMonths: number;
  paymentMethod: "BANK_TRANSFER" | "TELEBIRR" | "CASH";
  referenceNumber: string;
  notes?: string;
  screenshotFilename: string;
}) {
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, tenantId: input.tenantId, deletedAt: null },
    include: {
      tenant: true,
      subscription: { include: { plan: true } },
    },
  });

  if (!branch?.subscription) {
    throw new AppError(404, "Subscription not found");
  }

  const plan = branch.subscription.plan;
  if (Number(plan.priceMonthly) === 0) {
    throw new AppError(400, "Free plan does not require renewal payments");
  }

  const existingPending = await prisma.payment.findFirst({
    where: {
      tenantId: input.tenantId,
      branchId: input.branchId,
      status: "PENDING",
    },
  });
  if (existingPending) {
    throw new AppError(
      400,
      "You already have a pending payment for this branch. Wait for admin review.",
    );
  }

  const amount = Number(plan.priceMonthly) * input.durationMonths;
  const screenshotUrl = `/uploads/payments/${input.screenshotFilename}`;

  const payment = await prisma.payment.create({
    data: {
      tenantId: input.tenantId,
      branchId: input.branchId,
      amount,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber,
      screenshotUrl,
      durationMonths: input.durationMonths,
      status: "PENDING",
      adminNotes: input.notes || null,
    },
  });

  await notifyTenant({
    tenantId: input.tenantId,
    type: "PAYMENT",
    title: "Payment pending approval",
    message: `Renewal payment of ${amount} ETB for ${branch.name} is awaiting admin review.`,
    email: {
      subject: "Payment received — pending approval",
      text: `Hi ${branch.tenant.fullName},

We received your renewal payment for ${branch.name}.

Amount: ${amount} ETB
Duration: ${input.durationMonths} month(s)
Reference: ${input.referenceNumber}

Status: Pending admin approval.

KitchenOS Team`,
    },
  });

  await logActivity({
    userType: "TENANT",
    userId: input.tenantId,
    action: "CREATE",
    entityType: "payment",
    entityId: payment.id,
    details: { branchId: input.branchId, amount, durationMonths: input.durationMonths },
  });

  await recordSubscriptionEvent({
    subscriptionId: branch.subscription.id,
    branchId: input.branchId,
    tenantId: input.tenantId,
    kind: "RENEWAL_SUBMITTED",
    summary: `Renewal payment submitted: ${amount} ETB for ${input.durationMonths} month(s).`,
    actorType: "TENANT",
    actorId: input.tenantId,
    meta: {
      paymentId: payment.id,
      amount,
      durationMonths: input.durationMonths,
      paymentMethod: input.paymentMethod,
    },
  });

  return serializePayment(payment);
}

export async function listTenantPayments(tenantId: string, branchId?: string) {
  const payments = await prisma.payment.findMany({
    where: {
      tenantId,
      ...(branchId ? { branchId } : {}),
    },
    include: {
      branch: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return payments.map((payment) => ({
    ...serializePayment(payment),
    branchName: payment.branch?.name ?? null,
  }));
}

export async function listAdminPayments(input: {
  status?: string;
  page?: string | number;
  pageSize?: string | number;
  all?: boolean;
}) {
  const status = input.status;
  const where =
    status && status !== "ALL"
      ? { status: status as "PENDING" | "APPROVED" | "REJECTED" }
      : {};

  const include = {
    tenant: {
      select: {
        id: true,
        fullName: true,
        email: true,
        businessName: true,
      },
    },
    branch: { select: { id: true, name: true } },
    approvedBy: { select: { id: true, name: true } },
  } as const;

if (input.all) {
    const payments = await prisma.payment.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });
    const items = payments.map((payment) => ({
      ...serializePayment(payment),
      tenant: payment.tenant,
      branchName: payment.branch?.name ?? null,
      approvedByName: payment.approvedBy?.name ?? null,
    }));
    return toPageResult(items, items.length, 1, items.length || 1);
  }

  const { page, pageSize, skip } = parsePageParams(input);
  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return toPageResult(
    payments.map((payment) => ({
      ...serializePayment(payment),
      tenant: payment.tenant,
      branchName: payment.branch?.name ?? null,
      approvedByName: payment.approvedBy?.name ?? null,
    })),
    total,
    page,
    pageSize,
  );
}

export async function approvePayment(input: {
  paymentId: string;
  adminId: string;
  overrideStartDate?: string | null;
  adminNotes?: string;
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: {
      tenant: true,
      branch: { include: { subscription: { include: { plan: true } } } },
    },
  });

  if (!payment) throw new AppError(404, "Payment not found");
  if (payment.status !== "PENDING") {
    throw new AppError(400, "Only pending payments can be approved");
  }
  if (!payment.branch?.subscription) {
    throw new AppError(400, "Payment is not linked to a branch subscription");
  }

  const subscription = payment.branch.subscription;
  const now = new Date();
  const override = input.overrideStartDate
    ? new Date(input.overrideStartDate)
    : null;

  let newStart = subscription.startDate;
  let newExpiry: Date;

  const base =
    override ??
    (subscription.expiryDate && subscription.expiryDate > now
      ? subscription.expiryDate
      : now);

  if (override) {
    newStart = override;
    newExpiry = addMonths(override, payment.durationMonths);
  } else if (subscription.expiryDate && subscription.expiryDate > now) {
    // extend from current expiry
    newExpiry = addMonths(subscription.expiryDate, payment.durationMonths);
  } else {
    // expired: extend from today
    newStart = now;
    newExpiry = addMonths(now, payment.durationMonths);
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "APPROVED",
        approvedById: input.adminId,
        adminNotes: input.adminNotes || payment.adminNotes,
      },
    });

    const updatedSub = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        startDate: newStart,
        expiryDate: newExpiry,
        cancelledAt: null,
        retentionPurgedAt: null,
      },
      include: { plan: true },
    });

    return { updatedPayment, updatedSub };
  });

  await notifyTenant({
    tenantId: payment.tenantId,
    type: "PAYMENT",
    title: "Payment approved",
    message: `Subscription extended until ${newExpiry.toDateString()}.`,
    email: {
      subject: "Payment confirmed — subscription extended",
      text: `Hi ${payment.tenant.fullName},

Your payment was approved and the subscription for ${payment.branch.name} is now active.

Amount: ${payment.amount.toString()} ETB
New expiry: ${newExpiry.toDateString()}

KitchenOS Team`,
    },
  });

  await logActivity({
    userType: "ADMIN",
    userId: input.adminId,
    action: "APPROVE",
    entityType: "payment",
    entityId: payment.id,
    details: {
      branchId: payment.branchId,
      newExpiry: newExpiry.toISOString(),
      base: base.toISOString(),
    },
  });

  await recordSubscriptionEvent({
    subscriptionId: subscription.id,
    branchId: payment.branchId!,
    tenantId: payment.tenantId,
    kind: "PAYMENT_APPROVED",
    fromStatus: subscription.status,
    toStatus: "ACTIVE",
    summary: `Payment approved — extended until ${newExpiry.toDateString()} (${payment.durationMonths} month(s)).`,
    actorType: "ADMIN",
    actorId: input.adminId,
    meta: {
      paymentId: payment.id,
      amount: payment.amount.toString(),
      newExpiry: newExpiry.toISOString(),
      durationMonths: payment.durationMonths,
    },
  });

  return {
    payment: serializePayment(result.updatedPayment),
    subscription: {
      id: result.updatedSub.id,
      status: result.updatedSub.status,
      startDate: result.updatedSub.startDate,
      expiryDate: result.updatedSub.expiryDate,
      planName: result.updatedSub.plan.name,
    },
  };
}

export async function rejectPayment(input: {
  paymentId: string;
  adminId: string;
  reason?: string;
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: { tenant: true, branch: true },
  });

  if (!payment) throw new AppError(404, "Payment not found");
  if (payment.status !== "PENDING") {
    throw new AppError(400, "Only pending payments can be rejected");
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "REJECTED",
      approvedById: input.adminId,
      rejectionReason: input.reason?.trim() || "Payment rejected",
    },
  });

  await notifyTenant({
    tenantId: payment.tenantId,
    type: "PAYMENT",
    title: "Payment rejected",
    message: updated.rejectionReason || "Payment rejected",
    email: {
      subject: "Payment rejected — please resubmit",
      text: `Hi ${payment.tenant.fullName},

Your payment for ${payment.branch?.name ?? "your branch"} was rejected.

Reason: ${updated.rejectionReason}

Please submit a new payment with a valid screenshot and reference.

KitchenOS Team`,
    },
  });

  await logActivity({
    userType: "ADMIN",
    userId: input.adminId,
    action: "REJECT",
    entityType: "payment",
    entityId: payment.id,
    details: { reason: updated.rejectionReason },
  });

  return serializePayment(updated);
}

export async function listAdminSubscriptions(input: {
  filter?: string;
  page?: string | number;
  pageSize?: string | number;
}) {
  const filter = input.filter;
  const subscriptions = await prisma.subscription.findMany({
    include: {
      plan: true,
      branch: {
        include: {
          tenant: {
            select: {
              id: true,
              businessName: true,
              email: true,
              fullName: true,
            },
          },
        },
      },
    },
    orderBy: { expiryDate: "asc" },
  });

  const mapped = [];
  for (const subscription of subscriptions) {
    if (subscription.branch.deletedAt) continue;
    await syncSubscriptionStatus(subscription.id);
    const fresh = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
      include: {
        plan: true,
        branch: {
          include: {
            tenant: {
              select: {
                id: true,
                businessName: true,
                email: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    const view = computeSubscriptionView({
      status: fresh.status,
      expiryDate: fresh.expiryDate,
    });

    if (filter && filter !== "ALL") {
      if (filter === "NEARLY_EXPIRED" && view.status !== "NEARLY_EXPIRED") continue;
      if (filter !== "NEARLY_EXPIRED" && view.storedStatus !== filter) continue;
    }

    mapped.push({
      id: fresh.id,
      status: view.status,
      storedStatus: fresh.status,
      startDate: fresh.startDate,
      expiryDate: fresh.expiryDate,
      daysRemaining: view.daysRemaining,
      plan: {
        name: fresh.plan.name,
        slug: fresh.plan.slug,
        priceMonthly: fresh.plan.priceMonthly.toString(),
      },
      branch: {
        id: fresh.branch.id,
        name: fresh.branch.name,
      },
      tenant: fresh.branch.tenant,
    });
  }

  const { page, pageSize } = parsePageParams(input);
  const total = mapped.length;
  const start = (page - 1) * pageSize;
  return toPageResult(mapped.slice(start, start + pageSize), total, page, pageSize);
}

export async function adminExtendSubscription(input: {
  subscriptionId: string;
  adminId: string;
  months: number;
}) {
  if (![1, 3, 6, 12].includes(input.months)) {
    throw new AppError(400, "Months must be 1, 3, 6, or 12");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { id: input.subscriptionId },
    include: { branch: { select: { id: true, tenantId: true } } },
  });
  if (!subscription) throw new AppError(404, "Subscription not found");

  const now = new Date();
  const base =
    subscription.expiryDate && subscription.expiryDate > now
      ? subscription.expiryDate
      : now;
  const expiryDate = addMonths(base, input.months);

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "ACTIVE",
      expiryDate,
      startDate:
        !subscription.expiryDate || subscription.expiryDate <= now
          ? now
          : subscription.startDate,
      cancelledAt: null,
      retentionPurgedAt: null,
    },
  });

  await logActivity({
    userType: "ADMIN",
    userId: input.adminId,
    action: "EXTEND",
    entityType: "subscription",
    entityId: subscription.id,
    details: { months: input.months, expiryDate: expiryDate.toISOString() },
  });

  await recordSubscriptionEvent({
    subscriptionId: subscription.id,
    branchId: subscription.branchId,
    tenantId: subscription.branch.tenantId,
    kind: "EXTENDED",
    fromStatus: subscription.status,
    toStatus: "ACTIVE",
    summary: `Admin extended subscription by ${input.months} month(s) to ${expiryDate.toDateString()}.`,
    actorType: "ADMIN",
    actorId: input.adminId,
    meta: { months: input.months, expiryDate: expiryDate.toISOString() },
  });

  return updated;
}

export async function adminSetSubscriptionStatus(input: {
  subscriptionId: string;
  adminId: string;
  status: "SUSPENDED" | "CANCELLED" | "ACTIVE";
}) {
  const existing = await prisma.subscription.findUnique({
    where: { id: input.subscriptionId },
    include: { branch: { select: { tenantId: true } } },
  });
  if (!existing) throw new AppError(404, "Subscription not found");

  const updated = await prisma.subscription.update({
    where: { id: input.subscriptionId },
    data: {
      status: input.status,
      ...(input.status === "CANCELLED"
        ? { cancelledAt: new Date(), retentionPurgedAt: null }
        : {}),
      ...(input.status === "ACTIVE"
        ? { cancelledAt: null, retentionPurgedAt: null }
        : {}),
    },
  });

  await logActivity({
    userType: "ADMIN",
    userId: input.adminId,
    action:
      input.status === "SUSPENDED"
        ? "SUSPEND"
        : input.status === "ACTIVE"
          ? "ACTIVATE"
          : "CANCEL",
    entityType: "subscription",
    entityId: input.subscriptionId,
  });

  await recordSubscriptionEvent({
    subscriptionId: updated.id,
    branchId: updated.branchId,
    tenantId: existing.branch.tenantId,
    kind: input.status === "CANCELLED" ? "CANCELLED" : "STATUS_CHANGED",
    fromStatus: existing.status,
    toStatus: input.status,
    summary: `Admin set status to ${input.status}.`,
    actorType: "ADMIN",
    actorId: input.adminId,
  });

  return updated;
}

/** FR-6.1: after 30 days CANCELLED, purge branch menu data (keep branch shell for renew). */
export async function purgeExpiredCancelledSubscriptions(now = new Date()) {
  const cutoff = addDays(now, -RETENTION_DAYS);
  const due = await prisma.subscription.findMany({
    where: {
      status: "CANCELLED",
      cancelledAt: { lte: cutoff },
      retentionPurgedAt: null,
    },
    include: {
      plan: true,
      branch: {
        include: {
          tenant: {
            select: {
              id: true,
              fullName: true,
              businessName: true,
            },
          },
        },
      },
    },
  });

  let purged = 0;
  let errors = 0;

  for (const subscription of due) {
    try {
      const branchId = subscription.branchId;

      await prisma.$transaction(async (tx) => {
        await tx.menuItem.deleteMany({ where: { branchId } });
        await tx.category.updateMany({
          where: { branchId },
          data: { isActive: false },
        });
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { retentionPurgedAt: now },
        });
      });

      await recordSubscriptionEvent({
        subscriptionId: subscription.id,
        branchId,
        tenantId: subscription.branch.tenant.id,
        kind: "RETENTION_PURGED",
        toStatus: "CANCELLED",
        summary:
          "30-day retention ended — menu categories and items were removed.",
      });

      await notifyTenant({
        tenantId: subscription.branch.tenant.id,
        type: "SUBSCRIPTION",
        title: "Cancelled menu data removed",
        message: `${subscription.branch.name}: the 30-day retention window ended. Categories and items were removed. Renew to start a fresh menu.`,
        email: {
          subject: "KitchenOS: cancelled subscription data removed",
          text: `Hi ${subscription.branch.tenant.fullName},

The 30-day retention period for ${subscription.branch.name} (${subscription.branch.tenant.businessName}) has ended.

Menu categories and items for that branch have been removed. You can still renew the subscription and rebuild the menu.

KitchenOS Team`,
        },
      });

      await logActivity({
        userType: "ADMIN",
        userId: "system",
        action: "DELETE",
        entityType: "subscription_retention",
        entityId: subscription.id,
        details: { branchId, purgedAt: now.toISOString() },
      });

      purged += 1;
    } catch (error) {
      errors += 1;
      logger.warn("Retention purge failed", {
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { scanned: due.length, purged, errors, ranAt: now.toISOString() };
}

function serializePayment(payment: {
  id: string;
  amount: { toString(): string };
  paymentMethod: string;
  referenceNumber: string;
  screenshotUrl: string;
  durationMonths: number;
  status: string;
  adminNotes: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  branchId: string | null;
  tenantId: string;
}) {
  return {
    id: payment.id,
    tenantId: payment.tenantId,
    branchId: payment.branchId,
    amount: payment.amount.toString(),
    paymentMethod: payment.paymentMethod,
    referenceNumber: payment.referenceNumber,
    screenshotUrl: payment.screenshotUrl,
    durationMonths: payment.durationMonths,
    status: payment.status,
    adminNotes: payment.adminNotes,
    rejectionReason: payment.rejectionReason,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

export function paymentsToCsv(
  rows: Array<{
    id: string;
    amount: string;
    paymentMethod: string;
    referenceNumber: string;
    durationMonths: number;
    status: string;
    createdAt: Date;
    tenant?: { businessName: string; email: string };
    branchName?: string | null;
  }>,
) {
  const header = [
    "id",
    "business",
    "email",
    "branch",
    "amount",
    "method",
    "reference",
    "duration_months",
    "status",
    "created_at",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        csv(row.tenant?.businessName ?? ""),
        csv(row.tenant?.email ?? ""),
        csv(row.branchName ?? ""),
        row.amount,
        row.paymentMethod,
        csv(row.referenceNumber),
        String(row.durationMonths),
        row.status,
        row.createdAt.toISOString(),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csv(value: string) {
  if (value.includes(",") || value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
