import { createHash, randomBytes } from "node:crypto";
import slugify from "slugify";
import { prisma } from "./prisma.js";

/** Top-level path segments that must never be claimed as restaurant slugs. */
export const RESERVED_TENANT_SLUGS = new Set([
  "admin",
  "api",
  "assets",
  "activate",
  "dashboard",
  "favicon.ico",
  "health",
  "login",
  "menu",
  "r",
  "register",
  "static",
  "tenant",
  "uploads",
  "www",
]);

/** Portal pages under `/r/{tenant-slug}/…`. */
export const TENANT_PORTAL_SEGMENTS = new Set([
  "analytics",
  "branch",
  "branches", // legacy alias
  "change-password",
  "dashboard",
  "menu",
  "notifications",
  "orders",
  "payments",
  "qr",
  "settings",
  "subscription",
  "activate",
]);

export function toSlug(value: string) {
  return slugify(value, { lower: true, strict: true, trim: true });
}

export function isReservedTenantSlug(slug: string) {
  return RESERVED_TENANT_SLUGS.has(slug.toLowerCase());
}

/** 10-char hex suffix for permanent tenant slugs. */
export function secureSlugSuffix() {
  return randomBytes(5).toString("hex");
}

/**
 * Opaque public QR route id (32 hex chars). Never derived from name/DB id.
 */
export function generatePublicQrId() {
  return randomBytes(16).toString("hex");
}

export async function uniquePublicQrId() {
  for (let i = 0; i < 8; i += 1) {
    const id = generatePublicQrId();
    const [onBranch, inHistory] = await Promise.all([
      prisma.branch.findUnique({
        where: { publicQrId: id },
        select: { id: true },
      }),
      prisma.branchQrToken.findUnique({
        where: { token: id },
        select: { id: true },
      }),
    ]);
    if (!onBranch && !inHistory) return id;
  }
  // Extremely unlikely collision path
  return createHash("sha256")
    .update(randomBytes(32))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Permanent tenant slug: `{normalized-name}-{secureRandom}`.
 * Example: kidanemhiret-restaurant-fwefub47fb
 */
export async function uniqueTenantSlug(
  businessName: string,
  options?: { excludeTenantId?: string },
) {
  const base = toSlug(businessName) || "restaurant";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const slug = `${base}-${secureSlugSuffix()}`;
    if (!(await isTenantSlugTaken(slug, options?.excludeTenantId))) {
      return slug;
    }
  }
  throw new Error("Could not allocate a unique restaurant slug");
}

export async function isTenantSlugTaken(
  slug: string,
  excludeTenantId?: string,
) {
  const normalized = slug.toLowerCase();
  if (isReservedTenantSlug(normalized)) return true;

  const existing = await prisma.tenant.findUnique({
    where: { slug: normalized },
    select: { id: true },
  });
  if (!existing) return false;
  if (excludeTenantId && existing.id === excludeTenantId) return false;
  return true;
}

/**
 * Validate an admin-provided slug (already lowercased kebab-case).
 * Prefer name + random suffix for new slugs.
 */
export function assertValidTenantSlugFormat(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Slug must be lowercase letters, numbers, and hyphens only";
  }
  if (slug.length < 2 || slug.length > 100) {
    return "Slug must be between 2 and 100 characters";
  }
  if (isReservedTenantSlug(slug)) {
    return "This slug is reserved and cannot be used";
  }
  return null;
}

export async function uniqueBranchSlug(tenantId: string, name: string) {
  const base = toSlug(name) || "branch";
  let slug = base;
  let attempt = 1;

  while (
    await prisma.branch.findFirst({
      where: { tenantId, slug, deletedAt: null },
    })
  ) {
    attempt += 1;
    slug = `${base}-${attempt}`;
  }

  return slug;
}
