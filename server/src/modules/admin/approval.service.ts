import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "../../config/env.js";
import { logActivity } from "../../lib/activity-log.js";
import { generateSecurePassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { toSlug } from "../../lib/slug.js";
import { AppError } from "../../middleware/error.js";
import {
  accountApprovedEmail,
  accountRejectedEmail,
} from "../../services/email.js";
import { notifyTenant } from "../../services/notify.js";
import { generateBranchQr } from "../../services/qr.js";
import { recordSubscriptionEvent } from "../subscriptions/subscription-history.js";
import { TRIAL_DAYS, addDays } from "../subscriptions/subscription.logic.js";

function hashActivationToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Issue a single-use activation token; invalidates any unused prior tokens. */
async function issueActivationToken(tenantId: string, slug: string) {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashActivationToken(rawToken);
  const expiresAt = new Date(
    Date.now() + env.activationTokenHours * 60 * 60 * 1000,
  );

  await prisma.$transaction([
    prisma.activationToken.updateMany({
      where: { tenantId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.activationToken.create({
      data: { tenantId, tokenHash, expiresAt },
    }),
  ]);

  const activationUrl = `${env.clientUrl}/tenant/activate/${encodeURIComponent(slug)}/${encodeURIComponent(rawToken)}`;
  return { activationUrl, expiresAt };
}

export const rejectRegistrationSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const bulkRejectSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  reason: z.string().trim().max(1000).optional(),
});

export const bulkApproveSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

async function approveSingleRegistration(tenantId: string, adminId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      selectedPlan: true,
      payments: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      branches: true,
    },
  });

  if (!tenant) {
    throw new AppError(404, "Registration not found");
  }
  if (tenant.status !== "PENDING_APPROVAL") {
    throw new AppError(400, "Registration is not pending approval");
  }

  const plainPassword = generateSecurePassword(12);
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  const isPaid = Number(tenant.selectedPlan.priceMonthly) > 0;
  const pendingPayment = tenant.payments[0] ?? null;

  if (isPaid && !pendingPayment) {
    throw new AppError(
      400,
      "Paid plan registration requires a pending payment before approval",
    );
  }

  const branchName = tenant.businessName;
  const branchSlug = toSlug(branchName) || "main";
  const now = new Date();
  const durationMonths = pendingPayment?.durationMonths ?? 1;
  // FR-6.1: every approval starts a 14-day TRIAL; paid months begin after trial ends.
  const trialExpiry = addDays(now, TRIAL_DAYS);

  const result = await prisma.$transaction(async (tx) => {
    const updatedTenant = await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        status: "ACTIVE",
        passwordHash,
        mustChangePassword: true,
        activatedAt: null,
        rejectedReason: null,
      },
    });

    const branch = await tx.branch.create({
      data: {
        tenantId: tenant.id,
        name: branchName,
        location: tenant.businessLocation,
        phone: tenant.phone,
        slug: branchSlug,
        isActive: true,
        isDefault: true,
      },
    });

    await tx.subscription.create({
      data: {
        branchId: branch.id,
        planId: tenant.selectedPlanId,
        status: "TRIAL",
        startDate: now,
        expiryDate: trialExpiry,
        isAutoRenew: false,
      },
    });

    if (pendingPayment) {
      await tx.payment.update({
        where: { id: pendingPayment.id },
        data: {
          status: "APPROVED",
          approvedById: adminId,
          branchId: branch.id,
          adminNotes: "Approved with registration",
        },
      });
    }

    return { updatedTenant, branch };
  });

  const qr = await generateBranchQr({
    tenantSlug: tenant.slug,
    branchSlug: result.branch.slug,
    branchId: result.branch.id,
  });

  await prisma.branch.update({
    where: { id: result.branch.id },
    data: { qrCodeUrl: qr.qrCodeUrl },
  });

  const subscription = await prisma.subscription.findUnique({
    where: { branchId: result.branch.id },
  });
  if (subscription) {
    await recordSubscriptionEvent({
      subscriptionId: subscription.id,
      branchId: result.branch.id,
      tenantId: tenant.id,
      kind: "CREATED",
      toStatus: "TRIAL",
      summary: pendingPayment
        ? `14-day trial started. After trial, paid access continues for ${durationMonths} month(s).`
        : `14-day trial started on the ${tenant.selectedPlan.name} plan.`,
      actorType: "ADMIN",
      actorId: adminId,
      meta: {
        planId: tenant.selectedPlanId,
        planName: tenant.selectedPlan.name,
        trialDays: TRIAL_DAYS,
        trialExpiry: trialExpiry.toISOString(),
        paidDurationMonths: isPaid ? durationMonths : null,
      },
    });
  }

  const { activationUrl } = await issueActivationToken(tenant.id, tenant.slug);
  const loginUrl = `${env.clientUrl}/tenant/login`;
  const emailContent = accountApprovedEmail({
    fullName: tenant.fullName,
    businessName: tenant.businessName,
    email: tenant.email,
    password: plainPassword,
    planName: tenant.selectedPlan.name,
    branchName: result.branch.name,
    loginUrl,
    activationUrl,
    activationHours: env.activationTokenHours,
    trialDays: TRIAL_DAYS,
  });

  const notifyResult = await notifyTenant({
    tenantId: tenant.id,
    type: "SYSTEM",
    title: "Account approved — activate to sign in",
    message: `Your KitchenOS account was approved on the ${tenant.selectedPlan.name} plan. Open the activation link in your email to set your password.`,
    forceEmail: true,
    email: {
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    },
  });

  await logActivity({
    userType: "ADMIN",
    userId: adminId,
    action: "APPROVE",
    entityType: "tenant",
    entityId: tenant.id,
    details: {
      businessName: tenant.businessName,
      plan: tenant.selectedPlan.slug,
      branchId: result.branch.id,
      emailDelivered: notifyResult.emailed,
      activationIssued: true,
    },
  });

  return {
    id: tenant.id,
    email: tenant.email,
    businessName: tenant.businessName,
    status: "ACTIVE" as const,
    branch: {
      id: result.branch.id,
      name: result.branch.name,
      slug: result.branch.slug,
      qrCodeUrl: qr.qrCodeUrl,
      menuUrl: qr.menuUrl,
    },
    // One-time reveal for the approving admin UI (also emailed). Never logged.
    temporaryPassword: plainPassword,
    activationUrl,
    loginUrl,
    emailDelivered: notifyResult.emailed,
  };
}

/**
 * Rotate temporary password + issue a fresh activation link for an
 * approved but not-yet-activated tenant (expired/lost email recovery).
 */
export async function resendActivation(tenantId: string, adminId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      selectedPlan: true,
      branches: {
        where: { deletedAt: null, isDefault: true },
        take: 1,
      },
    },
  });

  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }
  if (tenant.status !== "ACTIVE") {
    throw new AppError(400, "Only approved accounts can receive activation emails");
  }
  if (tenant.activatedAt) {
    throw new AppError(400, "This account is already activated");
  }

  const plainPassword = generateSecurePassword(12);
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      passwordHash,
      mustChangePassword: true,
      activatedAt: null,
    },
  });

  const { activationUrl } = await issueActivationToken(tenant.id, tenant.slug);
  const loginUrl = `${env.clientUrl}/tenant/login`;
  const branchName = tenant.branches[0]?.name ?? tenant.businessName;

  const emailContent = accountApprovedEmail({
    fullName: tenant.fullName,
    businessName: tenant.businessName,
    email: tenant.email,
    password: plainPassword,
    planName: tenant.selectedPlan.name,
    branchName,
    loginUrl,
    activationUrl,
    activationHours: env.activationTokenHours,
    trialDays: TRIAL_DAYS,
  });

  const notifyResult = await notifyTenant({
    tenantId: tenant.id,
    type: "SYSTEM",
    title: "New activation link",
    message:
      "A new account activation link was issued. Open the email to set your password.",
    forceEmail: true,
    email: {
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    },
  });

  await logActivity({
    userType: "ADMIN",
    userId: adminId,
    action: "UPDATE",
    entityType: "tenant",
    entityId: tenant.id,
    details: {
      field: "activation_resend",
      emailDelivered: notifyResult.emailed,
    },
  });

  return {
    id: tenant.id,
    email: tenant.email,
    businessName: tenant.businessName,
    temporaryPassword: plainPassword,
    activationUrl,
    loginUrl,
    emailDelivered: notifyResult.emailed,
  };
}

async function rejectSingleRegistration(
  tenantId: string,
  adminId: string,
  reason?: string,
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { selectedPlan: true },
  });

  if (!tenant) {
    throw new AppError(404, "Registration not found");
  }
  if (tenant.status !== "PENDING_APPROVAL") {
    throw new AppError(400, "Registration is not pending approval");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const tenantUpdate = await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        status: "REJECTED",
        rejectedReason: reason?.trim() || null,
      },
    });

    await tx.payment.updateMany({
      where: { tenantId: tenant.id, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectionReason: reason?.trim() || "Registration rejected",
        approvedById: adminId,
      },
    });

    return tenantUpdate;
  });

  const emailContent = accountRejectedEmail({
    fullName: tenant.fullName,
    businessName: tenant.businessName,
    reason,
  });

  await notifyTenant({
    tenantId: tenant.id,
    type: "SYSTEM",
    title: "Registration rejected",
    message: reason?.trim() || "Your KitchenOS registration was rejected.",
    email: {
      subject: emailContent.subject,
      text: emailContent.text,
    },
  });

  await logActivity({
    userType: "ADMIN",
    userId: adminId,
    action: "REJECT",
    entityType: "tenant",
    entityId: tenant.id,
    details: {
      businessName: tenant.businessName,
      reason: reason ?? null,
    },
  });

  return {
    id: updated.id,
    email: updated.email,
    businessName: updated.businessName,
    status: updated.status,
    rejectedReason: updated.rejectedReason,
  };
}

export async function approveRegistration(tenantId: string, adminId: string) {
  return approveSingleRegistration(tenantId, adminId);
}

export async function rejectRegistration(
  tenantId: string,
  adminId: string,
  reason?: string,
) {
  return rejectSingleRegistration(tenantId, adminId, reason);
}

export async function bulkApproveRegistrations(ids: string[], adminId: string) {
  const results = [];
  for (const id of ids) {
    results.push(await approveSingleRegistration(id, adminId));
  }
  return results;
}

export async function bulkRejectRegistrations(
  ids: string[],
  adminId: string,
  reason?: string,
) {
  const results = [];
  for (const id of ids) {
    results.push(await rejectSingleRegistration(id, adminId, reason));
  }
  return results;
}
