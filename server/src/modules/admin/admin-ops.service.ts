import { Prisma } from "@prisma/client";
import { z } from "zod";
import { logActivity } from "../../lib/activity-log.js";
import { parsePageParams, toPageResult } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";
import { notifyTenant } from "../../services/notify.js";

export async function listTenantNotifications(tenantId: string) {
  return prisma.notification.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function countUnreadNotifications(tenantId: string) {
  const unread = await prisma.notification.count({
    where: { tenantId, isRead: false },
  });
  return { unread };
}

export async function markNotificationRead(tenantId: string, id: string) {
  const existing = await prisma.notification.findFirst({
    where: { id, tenantId },
  });
  if (!existing) throw new AppError(404, "Notification not found");
  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
}

export async function markAllNotificationsRead(tenantId: string) {
  await prisma.notification.updateMany({
    where: { tenantId, isRead: false },
    data: { isRead: true },
  });
  return { success: true };
}

export async function getTenantSettings(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      businessName: true,
      businessLocation: true,
      businessDescription: true,
      logoUrl: true,
      emailNotificationsEnabled: true,
      selectedPlan: {
        select: { name: true, slug: true },
      },
    },
  });
  if (!tenant) throw new AppError(404, "Tenant not found");
  return tenant;
}

/** Store restaurant logo from a device file upload (local path under /uploads/logos). */
export async function updateTenantLogo(
  tenantId: string,
  filename: string,
) {
  const logoUrl = `/uploads/logos/${filename}`;
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { logoUrl },
    select: {
      id: true,
      businessName: true,
      logoUrl: true,
    },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "UPDATE",
    entityType: "tenant_logo",
    entityId: tenantId,
    details: { logoUrl },
  });

  return tenant;
}

export async function removeTenantLogo(tenantId: string) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { logoUrl: null },
    select: {
      id: true,
      businessName: true,
      logoUrl: true,
    },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "DELETE",
    entityType: "tenant_logo",
    entityId: tenantId,
  });

  return tenant;
}

export const updateSettingsSchema = z.object({
  emailNotificationsEnabled: z.boolean().optional(),
  phone: z.string().trim().min(7).optional(),
  businessDescription: z.string().trim().optional().nullable(),
});

export async function updateTenantSettings(
  tenantId: string,
  input: z.infer<typeof updateSettingsSchema>,
) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(input.emailNotificationsEnabled != null
        ? { emailNotificationsEnabled: input.emailNotificationsEnabled }
        : {}),
      ...(input.phone != null ? { phone: input.phone } : {}),
      ...(input.businessDescription !== undefined
        ? { businessDescription: input.businessDescription }
        : {}),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      businessName: true,
      businessLocation: true,
      businessDescription: true,
      logoUrl: true,
      emailNotificationsEnabled: true,
    },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "UPDATE",
    entityType: "tenant_settings",
    entityId: tenantId,
    details: input,
  });

  return tenant;
}

export async function listAdminTenants(filters: {
  status?: string;
  plan?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string | number;
  pageSize?: string | number;
  /** When true, return all matching rows (for announcement picker). */
  all?: boolean;
}) {
  const createdAt: Prisma.DateTimeFilter = {};
  if (filters.from) {
    const from = new Date(filters.from);
    if (!Number.isNaN(from.getTime())) createdAt.gte = from;
  }
  if (filters.to) {
    const to = new Date(filters.to);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      createdAt.lte = to;
    }
  }

  const where: Prisma.TenantWhereInput = {
    ...(filters.status && filters.status !== "ALL"
      ? {
          status: filters.status as
            | "ACTIVE"
            | "PENDING_APPROVAL"
            | "SUSPENDED"
            | "REJECTED",
        }
      : {}),
    ...(filters.plan && filters.plan !== "ALL"
      ? { selectedPlan: { slug: filters.plan } }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { businessName: { contains: filters.q, mode: "insensitive" } },
            { email: { contains: filters.q, mode: "insensitive" } },
            { fullName: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
  };

  const include = {
    selectedPlan: true,
    _count: {
      select: {
        branches: { where: { deletedAt: null } },
      },
    },
  } as const;

  if (filters.all) {
    const tenants = await prisma.tenant.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });
    return {
      items: tenants.map((tenant) => ({
        id: tenant.id,
        fullName: tenant.fullName,
        email: tenant.email,
        phone: tenant.phone,
        businessName: tenant.businessName,
        businessLocation: tenant.businessLocation,
        status: tenant.status,
        suspendedReason: tenant.suspendedReason,
        createdAt: tenant.createdAt,
        plan: {
          name: tenant.selectedPlan.name,
          slug: tenant.selectedPlan.slug,
        },
        branchCount: tenant._count.branches,
      })),
      page: 1,
      pageSize: tenants.length,
      total: tenants.length,
      totalPages: 1,
    };
  }

  const { page, pageSize, skip } = parsePageParams(filters);
  const [total, tenants] = await Promise.all([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return toPageResult(
    tenants.map((tenant) => ({
      id: tenant.id,
      fullName: tenant.fullName,
      email: tenant.email,
      phone: tenant.phone,
      businessName: tenant.businessName,
      businessLocation: tenant.businessLocation,
      status: tenant.status,
      suspendedReason: tenant.suspendedReason,
      createdAt: tenant.createdAt,
      plan: {
        name: tenant.selectedPlan.name,
        slug: tenant.selectedPlan.slug,
      },
      branchCount: tenant._count.branches,
    })),
    total,
    page,
    pageSize,
  );
}

export async function getAdminTenant(id: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      selectedPlan: true,
      branches: {
        where: { deletedAt: null },
        include: {
          subscription: { include: { plan: true } },
          _count: {
            select: { menuItems: { where: { deletedAt: null } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!tenant) throw new AppError(404, "Tenant not found");

  return {
    id: tenant.id,
    fullName: tenant.fullName,
    email: tenant.email,
    phone: tenant.phone,
    businessName: tenant.businessName,
    businessLocation: tenant.businessLocation,
    businessDescription: tenant.businessDescription,
    status: tenant.status,
    suspendedReason: tenant.suspendedReason,
    rejectedReason: tenant.rejectedReason,
    createdAt: tenant.createdAt,
    plan: {
      name: tenant.selectedPlan.name,
      slug: tenant.selectedPlan.slug,
      priceMonthly: tenant.selectedPlan.priceMonthly.toString(),
    },
    branches: tenant.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      location: branch.location,
      slug: branch.slug,
      itemCount: branch._count.menuItems,
      subscriptionStatus: branch.subscription?.status ?? null,
      planName: branch.subscription?.plan.name ?? null,
      expiryDate: branch.subscription?.expiryDate ?? null,
    })),
  };
}

export async function setTenantStatus(input: {
  tenantId: string;
  adminId: string;
  status: "ACTIVE" | "SUSPENDED";
  reason?: string;
}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) throw new AppError(404, "Tenant not found");
  if (tenant.status === "PENDING_APPROVAL" || tenant.status === "REJECTED") {
    throw new AppError(400, "Choose this option only after approving or declining the application");
  }

  const updated = await prisma.tenant.update({
    where: { id: input.tenantId },
    data: {
      status: input.status,
      suspendedReason:
        input.status === "SUSPENDED"
          ? input.reason?.trim() || "Suspended by admin"
          : null,
    },
  });

  if (input.status === "SUSPENDED") {
    await notifyTenant({
      tenantId: tenant.id,
      type: "SYSTEM",
      title: "Account suspended",
      message: updated.suspendedReason || "Your account was suspended.",
      email: {
        subject: "KitchenOS account suspended",
        text: `Hi ${tenant.fullName},\n\nYour KitchenOS account has been suspended.\nReason: ${updated.suspendedReason}\n\nKitchenOS Team`,
      },
    });
  } else {
    await notifyTenant({
      tenantId: tenant.id,
      type: "SYSTEM",
      title: "Account activated",
      message: "Your KitchenOS account is active again.",
      email: {
        subject: "KitchenOS account activated",
        text: `Hi ${tenant.fullName},\n\nYour KitchenOS account has been reactivated.\n\nKitchenOS Team`,
      },
    });
  }

  await logActivity({
    userType: "ADMIN",
    userId: input.adminId,
    action: input.status === "SUSPENDED" ? "SUSPEND" : "ACTIVATE",
    entityType: "tenant",
    entityId: tenant.id,
    details: { reason: input.reason ?? null },
  });

  return updated;
}

export async function deleteTenant(tenantId: string, adminId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AppError(404, "Tenant not found");

  await prisma.tenant.delete({ where: { id: tenantId } });

  await logActivity({
    userType: "ADMIN",
    userId: adminId,
    action: "DELETE",
    entityType: "tenant",
    entityId: tenantId,
    details: { businessName: tenant.businessName, email: tenant.email },
  });

  return { id: tenantId, deleted: true };
}

export async function listPlansAdmin() {
  const plans = await prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } });
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    priceMonthly: plan.priceMonthly.toString(),
    maxBranches: plan.maxBranches,
    maxItems: plan.maxItems,
    features: plan.features,
    isActive: plan.isActive,
  }));
}

export const updatePlanSchema = z.object({
  name: z.string().trim().min(2).optional(),
  priceMonthly: z.coerce.number().min(0).optional(),
  maxBranches: z.coerce.number().int().optional(),
  maxItems: z.union([z.number().int().positive(), z.null()]).optional(),
  isActive: z.boolean().optional(),
  features: z
    .object({
      customQr: z.boolean().optional(),
      analytics: z.string().optional(),
      support: z.string().optional(),
    })
    .optional(),
});

export async function updatePlanAdmin(
  planId: string,
  adminId: string,
  input: z.infer<typeof updatePlanSchema>,
) {
  const existing = await prisma.plan.findUnique({ where: { id: planId } });
  if (!existing) throw new AppError(404, "Plan not found");

  const updated = await prisma.plan.update({
    where: { id: planId },
    data: {
      ...(input.name != null ? { name: input.name } : {}),
      ...(input.priceMonthly != null
        ? { priceMonthly: input.priceMonthly }
        : {}),
      ...(input.maxBranches != null ? { maxBranches: input.maxBranches } : {}),
      ...(input.maxItems !== undefined ? { maxItems: input.maxItems } : {}),
      ...(input.isActive != null ? { isActive: input.isActive } : {}),
      ...(input.features
        ? {
            features: {
              ...((existing.features as Record<string, unknown>) ?? {}),
              ...input.features,
            },
          }
        : {}),
    },
  });

  await logActivity({
    userType: "ADMIN",
    userId: adminId,
    action: "UPDATE",
    entityType: "plan",
    entityId: planId,
    details: input,
  });

  return {
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    priceMonthly: updated.priceMonthly.toString(),
    maxBranches: updated.maxBranches,
    maxItems: updated.maxItems,
    features: updated.features,
    isActive: updated.isActive,
  };
}

/** FR-9.1 — platform-wide branches list with subscription context. */
export async function listAdminBranches(filters: {
  q?: string;
  status?: string;
  includeDeleted?: boolean | string;
  page?: string | number;
  pageSize?: string | number;
}) {
  const includeDeleted =
    filters.includeDeleted === true ||
    filters.includeDeleted === "true" ||
    filters.includeDeleted === "1";

  const status = filters.status?.toUpperCase();
  const where: Prisma.BranchWhereInput = {
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" } },
            { location: { contains: filters.q, mode: "insensitive" } },
            { slug: { contains: filters.q, mode: "insensitive" } },
            {
              tenant: {
                OR: [
                  {
                    businessName: {
                      contains: filters.q,
                      mode: "insensitive",
                    },
                  },
                  { email: { contains: filters.q, mode: "insensitive" } },
                ],
              },
            },
          ],
        }
      : {}),
    ...(status && status !== "ALL"
      ? status === "NO_SUBSCRIPTION"
        ? { subscription: null }
        : {
            subscription: {
              status: status as
                | "TRIAL"
                | "ACTIVE"
                | "GRACE_PERIOD"
                | "EXPIRED"
                | "SUSPENDED"
                | "CANCELLED",
            },
          }
      : {}),
  };

  const { page, pageSize, skip } = parsePageParams(filters);
  const [total, branches] = await Promise.all([
    prisma.branch.count({ where }),
    prisma.branch.findMany({
      where,
      include: {
        tenant: {
          select: {
            id: true,
            businessName: true,
            email: true,
            status: true,
            slug: true,
          },
        },
        subscription: {
          include: {
            plan: {
              select: { id: true, name: true, slug: true, priceMonthly: true },
            },
          },
        },
        _count: {
          select: {
            menuItems: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return toPageResult(
    branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      location: branch.location,
      phone: branch.phone,
      slug: branch.slug,
      isActive: branch.isActive,
      isDefault: branch.isDefault,
      deletedAt: branch.deletedAt,
      createdAt: branch.createdAt,
      itemCount: branch._count.menuItems,
      tenant: branch.tenant,
      subscription: branch.subscription
        ? {
            id: branch.subscription.id,
            status: branch.subscription.status,
            startDate: branch.subscription.startDate,
            expiryDate: branch.subscription.expiryDate,
            plan: {
              name: branch.subscription.plan.name,
              slug: branch.subscription.plan.slug,
              priceMonthly: branch.subscription.plan.priceMonthly.toString(),
            },
          }
        : null,
    })),
    total,
    page,
    pageSize,
  );
}

export async function listActivityLogs(input: {
  page?: string | number;
  pageSize?: string | number;
}) {
  const { page, pageSize, skip } = parsePageParams(input);
  const [total, items] = await Promise.all([
    prisma.activityLog.count(),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);
  return toPageResult(items, total, page, pageSize);
}

export const announcementSchema = z.object({
  title: z.string().trim().min(2),
  message: z.string().trim().min(2),
  audience: z.enum(["ALL_ACTIVE", "SELECTED"]).default("ALL_ACTIVE"),
  tenantIds: z.array(z.string()).optional(),
});

export async function sendAnnouncement(input: {
  adminId: string;
  title: string;
  message: string;
  audience: "ALL_ACTIVE" | "SELECTED";
  tenantIds?: string[];
}) {
  if (input.audience === "SELECTED" && !input.tenantIds?.length) {
    throw new AppError(400, "Select at least one restaurant for a targeted announcement");
  }

  const tenants =
    input.audience === "SELECTED"
      ? await prisma.tenant.findMany({
          where: { id: { in: input.tenantIds }, status: "ACTIVE" },
        })
      : await prisma.tenant.findMany({ where: { status: "ACTIVE" } });

  let sent = 0;
  for (const tenant of tenants) {
    await notifyTenant({
      tenantId: tenant.id,
      type: "SYSTEM",
      title: input.title,
      message: input.message,
      email: {
        subject: input.title,
        text: `Hi ${tenant.fullName},\n\n${input.message}\n\nKitchenOS Team`,
      },
    });
    sent += 1;
  }

  await logActivity({
    userType: "ADMIN",
    userId: input.adminId,
    action: "CREATE",
    entityType: "announcement",
    details: {
      title: input.title,
      audience: input.audience,
      recipients: sent,
    },
  });

  return { recipients: sent };
}
