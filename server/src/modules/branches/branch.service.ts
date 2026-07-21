import { z } from "zod";
import { env } from "../../config/env.js";
import { logActivity } from "../../lib/activity-log.js";
import { prisma } from "../../lib/prisma.js";
import { uniqueBranchSlug } from "../../lib/slug.js";
import { AppError } from "../../middleware/error.js";
import { notifyTenant } from "../../services/notify.js";
import {
  generateBranchQr,
  resolveUploadAbsolutePath,
} from "../../services/qr.js";
import { recordSubscriptionEvent } from "../subscriptions/subscription-history.js";

export const branchInputSchema = z.object({
  name: z.string().trim().min(2, "Branch name is required"),
  location: z.string().trim().min(2, "Location is required"),
  phone: z.string().trim().optional(),
});

export type BranchInput = z.infer<typeof branchInputSchema>;

function serializeBranch(branch: {
  id: string;
  name: string;
  location: string;
  phone: string | null;
  slug: string;
  qrCodeUrl: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: { menuItems: number };
  subscription: {
    id: string;
    status: string;
    startDate: Date;
    expiryDate: Date | null;
    plan: {
      id: string;
      name: string;
      slug: string;
      priceMonthly: { toString(): string };
      maxBranches: number;
      maxItems: number | null;
    };
  } | null;
}) {
  return {
    id: branch.id,
    name: branch.name,
    location: branch.location,
    phone: branch.phone,
    slug: branch.slug,
    qrCodeUrl: branch.qrCodeUrl,
    isActive: branch.isActive,
    isDefault: branch.isDefault,
    itemCount: branch._count?.menuItems ?? 0,
    createdAt: branch.createdAt,
    updatedAt: branch.updatedAt,
    subscription: branch.subscription
      ? {
          id: branch.subscription.id,
          status: branch.subscription.status,
          startDate: branch.subscription.startDate,
          expiryDate: branch.subscription.expiryDate,
          plan: {
            id: branch.subscription.plan.id,
            name: branch.subscription.plan.name,
            slug: branch.subscription.plan.slug,
            priceMonthly: branch.subscription.plan.priceMonthly.toString(),
            maxBranches: branch.subscription.plan.maxBranches,
            maxItems: branch.subscription.plan.maxItems,
          },
        }
      : null,
  };
}

async function getTenantPlanContext(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      selectedPlan: true,
      branches: {
        where: { deletedAt: null },
        include: {
          subscription: true,
        },
      },
    },
  });

  if (!tenant || tenant.status !== "ACTIVE") {
    throw new AppError(403, "Tenant account is not active");
  }

  return tenant;
}

function assertCanAddBranch(maxBranches: number, currentCount: number) {
  // -1 means unlimited (Premium)
  if (maxBranches >= 0 && currentCount >= maxBranches) {
    throw new AppError(
      403,
      `Your plan allows up to ${maxBranches} branch${maxBranches === 1 ? "" : "es"}. Upgrade to add more.`,
      { code: "BRANCH_LIMIT", maxBranches, currentCount },
    );
  }
}

export async function listBranches(tenantId: string) {
  const tenant = await getTenantPlanContext(tenantId);
  const branches = await prisma.branch.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      subscription: { include: { plan: true } },
      _count: {
        select: { menuItems: { where: { deletedAt: null } } },
      },
    },
  });

  return {
    plan: {
      id: tenant.selectedPlan.id,
      name: tenant.selectedPlan.name,
      slug: tenant.selectedPlan.slug,
      maxBranches: tenant.selectedPlan.maxBranches,
      maxItems: tenant.selectedPlan.maxItems,
      priceMonthly: tenant.selectedPlan.priceMonthly.toString(),
    },
    canAddBranch:
      tenant.selectedPlan.maxBranches < 0 ||
      branches.length < tenant.selectedPlan.maxBranches,
    branches: branches.map(serializeBranch),
  };
}

export async function createBranch(tenantId: string, input: BranchInput) {
  const tenant = await getTenantPlanContext(tenantId);
  assertCanAddBranch(tenant.selectedPlan.maxBranches, tenant.branches.length);

  const isPaid = Number(tenant.selectedPlan.priceMonthly) > 0;
  const slug = await uniqueBranchSlug(tenantId, input.name);
  const now = new Date();

  // Paid new branches stay EXPIRED until payment/renewal (public menu locked).
  // If sibling has an active paid subscription, inherit its remaining window.
  let status: "ACTIVE" | "EXPIRED" = isPaid ? "EXPIRED" : "ACTIVE";
  let expiryDate: Date | null = null;

  if (!isPaid) {
    status = "ACTIVE";
    expiryDate = null;
  } else {
    const siblingActive = tenant.branches
      .map((b) => b.subscription)
      .filter((s) => s && s.status === "ACTIVE" && s.expiryDate && s.expiryDate > now)
      .sort((a, b) => (b!.expiryDate!.getTime() - a!.expiryDate!.getTime()));

    if (siblingActive[0]?.expiryDate) {
      status = "ACTIVE";
      expiryDate = siblingActive[0].expiryDate;
    } else {
      status = "EXPIRED";
      expiryDate = now;
    }
  }

  const branch = await prisma.$transaction(async (tx) => {
    const created = await tx.branch.create({
      data: {
        tenantId,
        name: input.name.trim(),
        location: input.location.trim(),
        phone: input.phone?.trim() || tenant.phone,
        slug,
        isActive: true,
        isDefault: false,
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        branchId: created.id,
        planId: tenant.selectedPlanId,
        status,
        startDate: now,
        expiryDate,
        isAutoRenew: false,
      },
    });

    return { created, subscription };
  });

  const qr = await generateBranchQr({
    tenantSlug: tenant.slug,
    branchSlug: branch.created.slug,
    branchId: branch.created.id,
  });

  const updated = await prisma.branch.update({
    where: { id: branch.created.id },
    data: { qrCodeUrl: qr.qrCodeUrl },
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { menuItems: { where: { deletedAt: null } } } },
    },
  });

  await recordSubscriptionEvent({
    subscriptionId: branch.subscription.id,
    branchId: branch.created.id,
    tenantId,
    kind: "CREATED",
    toStatus: status,
    summary: `Branch subscription created on ${tenant.selectedPlan.name} (${status}).`,
    actorType: "TENANT",
    actorId: tenantId,
    meta: {
      planId: tenant.selectedPlanId,
      expiryDate: expiryDate?.toISOString() ?? null,
    },
  });

  await notifyTenant({
    tenantId,
    type: "SYSTEM",
    title: `New branch: ${updated.name}`,
    message: `Branch added at ${updated.location}. Public menu: ${qr.menuUrl}`,
    email: {
      subject: `New branch added: ${updated.name}`,
      text: `Hi ${tenant.fullName},

A new branch was added to your KitchenOS account.

Branch: ${updated.name}
Location: ${updated.location}
Public menu: ${qr.menuUrl}

${status === "EXPIRED" ? "This branch needs an active subscription/payment before the public menu goes live.\n" : ""}
Best regards,
KitchenOS Team`,
    },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "CREATE",
    entityType: "branch",
    entityId: branch.created.id,
    details: { name: updated.name, status },
  });

  return {
    ...serializeBranch(updated),
    menuUrl: qr.menuUrl,
    requiresPayment: status === "EXPIRED",
  };
}

export async function updateBranch(
  tenantId: string,
  branchId: string,
  input: BranchInput,
) {
  const existing = await prisma.branch.findFirst({
    where: { id: branchId, tenantId, deletedAt: null },
    include: { subscription: { include: { plan: true } } },
  });
  if (!existing) {
    throw new AppError(404, "Branch not found");
  }

  let slug = existing.slug;
  if (input.name.trim() !== existing.name) {
    slug = await uniqueBranchSlug(tenantId, input.name);
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
  });

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: {
      name: input.name.trim(),
      location: input.location.trim(),
      phone: input.phone?.trim() || null,
      slug,
    },
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { menuItems: { where: { deletedAt: null } } } },
    },
  });

  if (slug !== existing.slug) {
    const features = updated.subscription?.plan.features as
      | { customQr?: boolean }
      | null;
    const canCustomize = Boolean(features?.customQr);
    const qr = await generateBranchQr({
      tenantSlug: tenant.slug,
      branchSlug: updated.slug,
      branchId: updated.id,
      fgColor: canCustomize ? existing.qrFgColor : null,
      bgColor: canCustomize ? existing.qrBgColor : null,
      logoPath:
        canCustomize && existing.qrUseLogo
          ? resolveUploadAbsolutePath(tenant.logoUrl)
          : null,
    });
    const withQr = await prisma.branch.update({
      where: { id: updated.id },
      data: { qrCodeUrl: qr.qrCodeUrl },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { menuItems: { where: { deletedAt: null } } } },
      },
    });

    await logActivity({
      userType: "TENANT",
      userId: tenantId,
      action: "UPDATE",
      entityType: "branch",
      entityId: branchId,
      details: { regeneratedQr: true },
    });

    return {
      ...serializeBranch(withQr),
      menuUrl: `${env.publicAppUrl}/r/${tenant.slug}/${withQr.slug}`,
    };
  }

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "UPDATE",
    entityType: "branch",
    entityId: branchId,
  });

  return serializeBranch(updated);
}

export async function softDeleteBranch(tenantId: string, branchId: string) {
  const branches = await prisma.branch.findMany({
    where: { tenantId, deletedAt: null },
  });

  if (branches.length <= 1) {
    throw new AppError(400, "Cannot delete your only branch");
  }

  const target = branches.find((b) => b.id === branchId);
  if (!target) {
    throw new AppError(404, "Branch not found");
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.branch.update({
      where: { id: branchId },
      data: {
        deletedAt: new Date(),
        isActive: false,
        isDefault: false,
      },
    });

    if (target.isDefault) {
      const nextDefault = branches.find((b) => b.id !== branchId);
      if (nextDefault) {
        await tx.branch.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        });
      }
    }

    return result;
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "DELETE",
    entityType: "branch",
    entityId: branchId,
    details: { softDelete: true, name: deleted.name },
  });

  return { id: deleted.id, deleted: true };
}
