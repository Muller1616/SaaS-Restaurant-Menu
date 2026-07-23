/**
 * Frontend path helpers for slug-based tenant portal URLs.
 * Backend API paths remain under `/tenant/...` and `/auth/tenant/...`.
 */

export const RESERVED_APP_SEGMENTS = new Set([
  "admin",
  "api",
  "login",
  "menu",
  "r",
  "register",
  "tenant",
  "uploads",
  "www",
]);

export const TENANT_PORTAL_SEGMENTS = new Set([
  "analytics",
  "branches",
  "change-password",
  "menu",
  "notifications",
  "payments",
  "qr",
  "settings",
  "subscription",
]);

export function tenantPortalPath(slug: string, ...segments: string[]) {
  const base = `/${encodeURIComponent(slug)}`;
  const rest = segments.filter(Boolean).join("/");
  return rest ? `${base}/${rest}` : base;
}

export function tenantActivationPath(slug: string, token: string) {
  return `/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
}

export function publicMenuPath(tenantSlug: string, branchSlug?: string | null) {
  if (branchSlug) return `/r/${tenantSlug}/${branchSlug}`;
  return `/r/${tenantSlug}`;
}

/** True when the browser path is a slug-based tenant workspace page. */
export function isTenantPortalPathname(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  const [first, second] = parts;
  if (RESERVED_APP_SEGMENTS.has(first)) {
    if (first === "tenant") {
      return (
        pathname !== "/tenant/login" &&
        !pathname.startsWith("/tenant/forgot-password") &&
        !pathname.startsWith("/tenant/reset-password") &&
        !pathname.startsWith("/tenant/activate")
      );
    }
    return false;
  }
  if (!second) return true;
  if (TENANT_PORTAL_SEGMENTS.has(second)) return true;
  // Long second segment is activation — not an authenticated portal page.
  return false;
}

export function looksLikeActivationToken(value: string) {
  return /^[A-Za-z0-9_-]{20,}$/.test(value);
}
