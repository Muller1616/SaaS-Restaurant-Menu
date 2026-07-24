import { z } from "zod";
import { logActivity } from "../../lib/activity-log.js";
import {
  invalidateAdminDashboardCache,
  invalidateCachesForBranch,
  invalidatePublicMenuCache,
} from "../../lib/cache/index.js";
import { formatBranchLocation } from "../../lib/branch-location.js";
import { toPublicMediaUrl } from "../../lib/media-url.js";
import { prisma } from "../../lib/prisma.js";
import { uniqueBranchSlug, uniquePublicQrId } from "../../lib/slug.js";
import { AppError } from "../../middleware/error.js";
import { notifyTenant } from "../../services/notify.js";
import { generateBranchQr, buildPublicQrUrl } from "../../services/qr.js";
import {
  recordIssuedQrToken,
  revokeBranchQrTokens,
  rotateBranchPublicQrToken,
} from "../qr/branch-qr-token.js";
import { recordSubscriptionEvent } from "../subscriptions/subscription-history.js";

export { formatBranchLocation } from "../../lib/branch-location.js";

const optionalTrimmed = z
  .string()
  .optional()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : undefined;
  });

export const branchInputSchema = z.object({
  name: z.string().trim().min(2, "Branch name is required"),
  location: z.string().trim().min(2, "Address is required"),
  city: optionalTrimmed,
  region: optionalTrimmed,
  country: optionalTrimmed,
  phone: optionalTrimmed,
  managerName: optionalTrimmed,
});

export type BranchInput = z.infer<typeof branchInputSchema>;

export const branchStatusSchema = z.object({
  isActive: z.boolean(),
});

function serializeBranch(branch: {
  id: string;
  name: string;
  location: string;
  city: string | null;
  region: string | null;
  country: string | null;
  phone: string | null;
  managerName: string | null;
  slug: string;
  publicQrId: string;
  qrCodeUrl: string | null;
  isActive: boolean;
  isDefault: boolean;
  deletedAt: Date | null;
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
  tenant?: { businessName: string };
}) {
  return {
    id: branch.id,
    name: branch.name,
    location: branch.location,
    city: branch.city,
    region: branch.region,
    country: branch.country,
    displayLocation: formatBranchLocation(branch),
    phone: branch.phone,
    managerName: branch.managerName,
    slug: branch.slug,
    publicQrId: branch.publicQrId,
    qrCodeUrl: toPublicMediaUrl(branch.qrCodeUrl),
    menuUrl: buildPublicQrUrl(branch.publicQrId),
    isActive: branch.isActive,
    isDefault: branch.isDefault,
    deletedAt: branch.deletedAt,
    itemCount: branch._count?.menuItems ?? 0,
    createdAt: branch.createdAt,
    updatedAt: branch.updatedAt,
    businessName: branch.tenant?.businessName,
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

const branchInclude = {
  subscription: { include: { plan: true } },
  tenant: { select: { businessName: true } },
  _count: {
    select: { menuItems: { where: { deletedAt: null } } },
  },
} as const;

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
    throw new AppError(403, "Your restaurant account isn’t active");
  }

  return tenant;
}

function assertCanAddBranch(maxBranches: number, currentCount: number) {
  if (maxBranches >= 0 && currentCount >= maxBranches) {
    throw new AppError(
      403,
      `Your plan allows up to ${maxBranches} branch${maxBranches === 1 ? "" : "es"}. Upgrade to add more.`,
      { code: "BRANCH_LIMIT", maxBranches, currentCount },
    );
  }
}

function branchDataFromInput(input: BranchInput, fallbackPhone?: string | null) {
  return {
    name: input.name.trim(),
    location: input.location.trim(),
    city: input.city ?? null,
    region: input.region ?? null,
    country: input.country ?? null,
    phone: input.phone ?? fallbackPhone ?? null,
    managerName: input.managerName ?? null,
  };
}

export async function listBranches(
  tenantId: string,
  options?: { includeDeleted?: boolean },
) {
  const tenant = await getTenantPlanContext(tenantId);
  const includeDeleted = Boolean(options?.includeDeleted);
  const branches = await prisma.branch.findMany({
    where: {
      tenantId,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
    orderBy: [{ deletedAt: "asc" }, { isDefault: "desc" }, { createdAt: "asc" }],
    include: branchInclude,
  });

  const activeCount = branches.filter((b) => !b.deletedAt).length;

  return {
    plan: {
      id: tenant.selectedPlan.id,
      name: tenant.selectedPlan.name,
      slug: tenant.selectedPlan.slug,
      maxBranches: tenant.selectedPlan.maxBranches,
      maxItems: tenant.selectedPlan.maxItems,
      priceMonthly: tenant.selectedPlan.priceMonthly.toString(),
    },
    businessName: tenant.businessName,
    canAddBranch:
      tenant.selectedPlan.maxBranches < 0 ||
      activeCount < tenant.selectedPlan.maxBranches,
    branches: branches.map(serializeBranch),
  };
}

export async function getBranch(tenantId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId },
    include: branchInclude,
  });
  if (!branch) {
    throw new AppError(404, "Branch not found");
  }
  return serializeBranch(branch);
}

export async function createBranch(tenantId: string, input: BranchInput) {
  const tenant = await getTenantPlanContext(tenantId);
  assertCanAddBranch(tenant.selectedPlan.maxBranches, tenant.branches.length);

  const isPaid = Number(tenant.selectedPlan.priceMonthly) > 0;
  const slug = await uniqueBranchSlug(tenantId, input.name);
  const publicQrId = await uniquePublicQrId();
  const now = new Date();

  let status: "ACTIVE" | "EXPIRED" = isPaid ? "EXPIRED" : "ACTIVE";
  let expiryDate: Date | null = null;

  if (!isPaid) {
    status = "ACTIVE";
    expiryDate = null;
  } else {
    const siblingActive = tenant.branches
      .map((b) => b.subscription)
      .filter((s) => s && s.status === "ACTIVE" && s.expiryDate && s.expiryDate > now)
      .sort((a, b) => b!.expiryDate!.getTime() - a!.expiryDate!.getTime());

    if (siblingActive[0]?.expiryDate) {
      status = "ACTIVE";
      expiryDate = siblingActive[0].expiryDate;
    } else {
      status = "EXPIRED";
      expiryDate = now;
    }
  }

  const fields = branchDataFromInput(input, tenant.phone);

  const branch = await prisma.$transaction(async (tx) => {
    const created = await tx.branch.create({
      data: {
        tenantId,
        ...fields,
        slug,
        publicQrId,
        qrCreatedAt: now,
        isActive: true,
        isDefault: false,
      },
    });

    await recordIssuedQrToken(tx, {
      token: publicQrId,
      branchId: created.id,
      tenantId,
      actor: { type: "TENANT", id: tenantId },
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
    publicQrId: branch.created.publicQrId,
    branchId: branch.created.id,
  });

  const updated = await prisma.branch.update({
    where: { id: branch.created.id },
    data: { qrCodeUrl: qr.qrCodeUrl },
    include: branchInclude,
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "CREATE",
    entityType: "branch_qr",
    entityId: branch.created.id,
    summary: "QR code generated successfully",
    details: {
      publicQrId: branch.created.publicQrId,
      menuUrl: qr.menuUrl,
      branchName: updated.name,
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
    message: `Branch added at ${formatBranchLocation(updated)}. Public menu: ${qr.menuUrl}`,
    email: {
      subject: `New branch added: ${updated.name}`,
      text: `Hi ${tenant.fullName},

A new branch was added to your KitchenOS account.

Branch: ${updated.name}
Location: ${formatBranchLocation(updated)}
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

  await invalidateAdminDashboardCache();
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

  const fields = branchDataFromInput(input);

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: {
      ...fields,
      slug,
    },
    include: branchInclude,
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "UPDATE",
    entityType: "branch",
    entityId: branchId,
    summary: `Branch updated: ${updated.name}`,
    details: {
      name: updated.name,
      location: formatBranchLocation(updated),
      slugChanged: slug !== existing.slug,
    },
  });

  if (slug !== existing.slug) {
    await invalidatePublicMenuCache({
      publicQrId: updated.publicQrId,
      tenantSlug: tenant.slug,
      branchSlug: existing.slug,
    });
  }

  await invalidateCachesForBranch(branchId);
  return {
    ...serializeBranch(updated),
    menuUrl: buildPublicQrUrl(updated.publicQrId),
  };
}

export async function setBranchActive(
  tenantId: string,
  branchId: string,
  isActive: boolean,
) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId, deletedAt: null },
  });
  if (!branch) {
    throw new AppError(404, "Branch not found");
  }

  if (branch.isDefault && !isActive) {
    const others = await prisma.branch.count({
      where: { tenantId, deletedAt: null, id: { not: branchId }, isActive: true },
    });
    if (others === 0) {
      throw new AppError(
        400,
        "Keep at least one active branch, or set another branch as default first.",
      );
    }
  }

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: { isActive },
    include: branchInclude,
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "UPDATE",
    entityType: "branch",
    entityId: branchId,
    summary: isActive ? "Branch activated" : "Branch deactivated",
    details: { isActive },
  });

  await invalidateCachesForBranch(branchId);
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

  await revokeBranchQrTokens(branchId);
  await invalidatePublicMenuCache({ publicQrId: deleted.publicQrId });
  await invalidateCachesForBranch(branchId);
  await invalidateAdminDashboardCache();
  return { id: deleted.id, deleted: true };
}

export async function restoreBranch(tenantId: string, branchId: string) {
  const tenant = await getTenantPlanContext(tenantId);
  assertCanAddBranch(tenant.selectedPlan.maxBranches, tenant.branches.length);

  const existing = await prisma.branch.findFirst({
    where: { id: branchId, tenantId, deletedAt: { not: null } },
  });
  if (!existing) {
    throw new AppError(404, "Deleted branch not found");
  }

  const previousToken = existing.publicQrId;
  const rotated = await rotateBranchPublicQrToken({
    branchId,
    tenantId,
    previousToken,
    actor: { type: "TENANT", id: tenantId },
  });

  const qr = await generateBranchQr({
    publicQrId: rotated.nextToken,
    branchId,
  });

  const restored = await prisma.branch.update({
    where: { id: branchId },
    data: {
      deletedAt: null,
      isActive: true,
      publicQrId: rotated.nextToken,
      qrCodeUrl: qr.qrCodeUrl,
      qrCreatedAt: rotated.rotatedAt,
      qrRegeneratedAt: rotated.rotatedAt,
    },
    include: branchInclude,
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "UPDATE",
    entityType: "branch",
    entityId: branchId,
    summary: "Branch restored",
    details: {
      previousPublicQrId: previousToken,
      publicQrId: rotated.nextToken,
    },
  });

  await invalidatePublicMenuCache({ publicQrId: previousToken });
  await invalidateCachesForBranch(branchId);
  await invalidateAdminDashboardCache();

  return {
    ...serializeBranch(restored),
    menuUrl: qr.menuUrl,
  };
}
