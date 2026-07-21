import { z } from "zod";
import { logActivity } from "../../lib/activity-log.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";
import {
  computeSubscriptionView,
  syncSubscriptionStatus,
} from "../subscriptions/subscription.logic.js";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required"),
  description: z.string().trim().optional(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export const menuItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  description: z.string().trim().optional(),
  price: z.coerce.number().positive("Price must be greater than 0"),
  currency: z.string().trim().default("ETB"),
  categoryId: z.string().min(1, "Category is required"),
  isAvailable: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .transform((v) => v === true || v === "true")
    .optional()
    .default(true),
  isFeatured: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .transform((v) => v === true || v === "true")
    .optional()
    .default(false),
  sortOrder: z.coerce.number().int().optional().default(0),
});

function serializeItem(item: {
  id: string;
  name: string;
  description: string | null;
  price: { toString(): string };
  currency: string;
  imageUrl: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  categoryId: string;
  createdAt: Date;
  category?: { id: string; name: string };
}) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price.toString(),
    currency: item.currency,
    imageUrl: item.imageUrl,
    isAvailable: item.isAvailable,
    isFeatured: item.isFeatured,
    sortOrder: item.sortOrder,
    categoryId: item.categoryId,
    categoryName: item.category?.name,
    createdAt: item.createdAt,
  };
}

export async function getMenuWorkspace(branchId: string) {
  const branch = await prisma.branch.findUniqueOrThrow({
    where: { id: branchId },
    include: {
      tenant: { select: { slug: true, businessName: true } },
      subscription: { include: { plan: true } },
      categories: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          menuItems: {
            where: { deletedAt: null },
            orderBy: [
              { isFeatured: "desc" },
              { sortOrder: "asc" },
              { name: "asc" },
            ],
          },
        },
      },
    },
  });

  if (branch.subscription) {
    await syncSubscriptionStatus(branch.subscription.id);
  }
  const subscription = branch.subscription
    ? await prisma.subscription.findUnique({
        where: { id: branch.subscription.id },
        include: { plan: true },
      })
    : null;

  const view = subscription
    ? computeSubscriptionView({
        status: subscription.status,
        expiryDate: subscription.expiryDate,
      })
    : null;

  const itemCount = await prisma.menuItem.count({
    where: { branchId, deletedAt: null },
  });
  const maxItems = subscription?.plan.maxItems ?? null;
  const canAddItem = Boolean(view?.canEdit) && (maxItems == null || itemCount < maxItems);

  return {
    branch: {
      id: branch.id,
      name: branch.name,
      slug: branch.slug,
      location: branch.location,
      phone: branch.phone,
    },
    tenant: branch.tenant,
    subscriptionStatus: view?.status ?? null,
    canEdit: Boolean(view?.canEdit),
    plan: subscription
      ? {
          name: subscription.plan.name,
          slug: subscription.plan.slug,
          maxItems: subscription.plan.maxItems,
        }
      : null,
    itemCount,
    canAddItem,
    previewUrl: `/r/${branch.tenant.slug}/${branch.slug}`,
    categories: branch.categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
      items: category.menuItems.map(serializeItem),
    })),
  };
}

export async function createCategory(
  tenantId: string,
  branchId: string,
  input: z.infer<typeof categorySchema>,
) {
  const category = await prisma.category.create({
    data: {
      branchId,
      name: input.name,
      description: input.description || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "CREATE",
    entityType: "category",
    entityId: category.id,
  });

  return category;
}

export async function updateCategory(
  tenantId: string,
  branchId: string,
  categoryId: string,
  input: z.infer<typeof categorySchema>,
) {
  const existing = await prisma.category.findFirst({
    where: { id: categoryId, branchId },
  });
  if (!existing) throw new AppError(404, "Category not found");

  const category = await prisma.category.update({
    where: { id: categoryId },
    data: {
      name: input.name,
      description: input.description || null,
      sortOrder: input.sortOrder ?? existing.sortOrder,
    },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "UPDATE",
    entityType: "category",
    entityId: category.id,
  });

  return category;
}

export async function deleteCategory(
  tenantId: string,
  branchId: string,
  categoryId: string,
) {
  const existing = await prisma.category.findFirst({
    where: { id: categoryId, branchId },
    include: { _count: { select: { menuItems: true } } },
  });
  if (!existing) throw new AppError(404, "Category not found");

  // Soft-hide category and soft-delete its items (SRS data-safety pattern)
  await prisma.$transaction([
    prisma.category.update({
      where: { id: categoryId },
      data: { isActive: false },
    }),
    prisma.menuItem.updateMany({
      where: { categoryId, deletedAt: null },
      data: { deletedAt: new Date(), isAvailable: false },
    }),
  ]);

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "DELETE",
    entityType: "category",
    entityId: categoryId,
    details: { itemCount: existing._count.menuItems },
  });

  return { id: categoryId, deleted: true };
}

async function assertItemLimit(branchId: string) {
  const branch = await prisma.branch.findUniqueOrThrow({
    where: { id: branchId },
    include: { subscription: { include: { plan: true } } },
  });
  const maxItems = branch.subscription?.plan.maxItems ?? null;
  if (maxItems == null) return;

  const count = await prisma.menuItem.count({
    where: { branchId, deletedAt: null },
  });
  if (count >= maxItems) {
    throw new AppError(
      403,
      `Your plan allows up to ${maxItems} menu items. Upgrade to add more.`,
      { code: "ITEM_LIMIT", maxItems, currentCount: count },
    );
  }
}

export async function createMenuItem(
  tenantId: string,
  branchId: string,
  input: z.infer<typeof menuItemSchema>,
  imageFilename?: string | null,
) {
  await assertItemLimit(branchId);

  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, branchId, isActive: true },
  });
  if (!category) throw new AppError(400, "Invalid category for this branch");

  const item = await prisma.menuItem.create({
    data: {
      branchId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description || null,
      price: input.price,
      currency: input.currency || "ETB",
      imageUrl: imageFilename ? `/uploads/menu/${imageFilename}` : null,
      isAvailable: input.isAvailable,
      isFeatured: input.isFeatured,
      sortOrder: input.sortOrder ?? 0,
    },
    include: { category: true },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "CREATE",
    entityType: "menu_item",
    entityId: item.id,
  });

  return serializeItem(item);
}

export async function updateMenuItem(
  tenantId: string,
  branchId: string,
  itemId: string,
  input: z.infer<typeof menuItemSchema>,
  imageFilename?: string | null,
) {
  const existing = await prisma.menuItem.findFirst({
    where: { id: itemId, branchId, deletedAt: null },
  });
  if (!existing) throw new AppError(404, "Menu item not found");

  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, branchId, isActive: true },
  });
  if (!category) throw new AppError(400, "Invalid category for this branch");

  const item = await prisma.menuItem.update({
    where: { id: itemId },
    data: {
      categoryId: input.categoryId,
      name: input.name,
      description: input.description || null,
      price: input.price,
      currency: input.currency || "ETB",
      ...(imageFilename
        ? { imageUrl: `/uploads/menu/${imageFilename}` }
        : {}),
      isAvailable: input.isAvailable,
      isFeatured: input.isFeatured,
      sortOrder: input.sortOrder ?? existing.sortOrder,
    },
    include: { category: true },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "UPDATE",
    entityType: "menu_item",
    entityId: item.id,
  });

  return serializeItem(item);
}

export async function deleteMenuItem(
  tenantId: string,
  branchId: string,
  itemId: string,
) {
  const existing = await prisma.menuItem.findFirst({
    where: { id: itemId, branchId, deletedAt: null },
  });
  if (!existing) throw new AppError(404, "Menu item not found");

  await prisma.menuItem.update({
    where: { id: itemId },
    data: { deletedAt: new Date(), isAvailable: false },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "DELETE",
    entityType: "menu_item",
    entityId: itemId,
  });

  return { id: itemId, deleted: true };
}

export async function getPublicMenu(tenantSlug: string, branchSlug?: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (!tenant || tenant.status === "REJECTED") {
    throw new AppError(404, "Menu not found");
  }

  if (tenant.status === "SUSPENDED") {
    return {
      unavailable: true as const,
      reason: "suspended" as const,
      businessName: tenant.businessName,
      logoUrl: tenant.logoUrl,
      message: "This menu isn’t available right now",
      phone: null as string | null,
      location: tenant.businessLocation,
    };
  }

  const branch = await prisma.branch.findFirst({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
      isActive: true,
      ...(branchSlug ? { slug: branchSlug } : {}),
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      subscription: true,
      categories: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          menuItems: {
            where: { isAvailable: true, deletedAt: null },
            orderBy: [
              { isFeatured: "desc" },
              { sortOrder: "asc" },
              { name: "asc" },
            ],
          },
        },
      },
    },
  });

  if (!branch) {
    throw new AppError(404, "Menu not found");
  }

  let subStatus = branch.subscription?.status ?? null;
  if (branch.subscription) {
    await syncSubscriptionStatus(branch.subscription.id);
    const fresh = await prisma.subscription.findUnique({
      where: { id: branch.subscription.id },
    });
    subStatus = fresh?.status ?? null;
  }

  if (!subStatus || ["EXPIRED", "SUSPENDED", "CANCELLED"].includes(subStatus)) {
    return {
      unavailable: true as const,
      reason: "expired" as const,
      businessName: tenant.businessName,
      logoUrl: tenant.logoUrl,
      branchName: branch.name,
      location: branch.location,
      phone: branch.phone,
      message:
        "This menu is temporarily unavailable. Please check back later.",
    };
  }

  return {
    unavailable: false as const,
    businessName: tenant.businessName,
    logoUrl: tenant.logoUrl,
    branchName: branch.name,
    location: branch.location,
    phone: branch.phone,
    categories: branch.categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      items: category.menuItems.map(serializeItem),
    })),
  };
}
