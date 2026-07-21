import slugify from "slugify";
import { prisma } from "./prisma.js";

export function toSlug(value: string) {
  return slugify(value, { lower: true, strict: true, trim: true });
}

export async function uniqueTenantSlug(businessName: string) {
  const base = toSlug(businessName) || "restaurant";
  let slug = base;
  let attempt = 1;

  while (await prisma.tenant.findUnique({ where: { slug } })) {
    attempt += 1;
    slug = `${base}-${attempt}`;
  }

  return slug;
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
