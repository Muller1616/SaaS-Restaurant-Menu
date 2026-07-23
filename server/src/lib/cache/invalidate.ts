import { cacheDel, cacheDelByPrefix } from "./cache.js";
import { CacheKeys } from "./keys.js";
import { prisma } from "../prisma.js";

/** Invalidate public menu caches for a branch (by QR id and optional slug paths). */
export async function invalidatePublicMenuCache(input: {
  publicQrId?: string | null;
  tenantSlug?: string | null;
  branchSlug?: string | null;
}) {
  const keys: string[] = [];
  if (input.publicQrId) {
    keys.push(CacheKeys.publicMenuByQr(input.publicQrId));
  }
  if (input.tenantSlug) {
    keys.push(CacheKeys.publicMenuBySlug(input.tenantSlug));
    if (input.branchSlug) {
      keys.push(CacheKeys.publicMenuBySlug(input.tenantSlug, input.branchSlug));
    }
  }
  if (keys.length) await cacheDel(...keys);
}

export async function invalidatePlansCache() {
  await cacheDel(CacheKeys.plansActive());
}

export async function invalidateAdminDashboardCache() {
  await cacheDel(CacheKeys.adminDashboard());
}

export async function invalidateTenantSettingsCache(tenantId: string) {
  await cacheDel(CacheKeys.tenantSettings(tenantId));
}

export async function invalidateBranchAnalyticsCache(branchId: string) {
  await cacheDelByPrefix(`tenant:analytics:${branchId}:`);
}

/** Look up branch → wipe public menu + analytics + admin dashboard caches. */
export async function invalidateCachesForBranch(branchId: string) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      publicQrId: true,
      slug: true,
      tenant: { select: { slug: true } },
    },
  });
  if (!branch) return;
  await invalidatePublicMenuCache({
    publicQrId: branch.publicQrId,
    tenantSlug: branch.tenant.slug,
    branchSlug: branch.slug,
  });
  await invalidateBranchAnalyticsCache(branch.id);
  await invalidateAdminDashboardCache();
}

/**
 * Wipe settings + all branch public menus / analytics for a tenant
 * (status, logo, profile changes).
 */
export async function invalidateCachesForTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      slug: true,
      branches: {
        where: { deletedAt: null },
        select: { id: true, publicQrId: true, slug: true },
      },
    },
  });
  if (!tenant) {
    await invalidateTenantSettingsCache(tenantId);
    await invalidateAdminDashboardCache();
    return;
  }

  await invalidateTenantSettingsCache(tenantId);
  await invalidateTenantPublicMenus({
    tenantSlug: tenant.slug,
    branches: tenant.branches,
  });
}

/** Invalidate all public menus for a tenant’s branches after menu edits. */
export async function invalidateTenantPublicMenus(input: {
  tenantSlug: string;
  branches: Array<{ id: string; publicQrId: string; slug: string }>;
}) {
  const keys: string[] = [CacheKeys.publicMenuBySlug(input.tenantSlug)];
  for (const branch of input.branches) {
    keys.push(CacheKeys.publicMenuByQr(branch.publicQrId));
    keys.push(CacheKeys.publicMenuBySlug(input.tenantSlug, branch.slug));
    await invalidateBranchAnalyticsCache(branch.id);
  }
  await cacheDel(...keys);
  await invalidateAdminDashboardCache();
}
