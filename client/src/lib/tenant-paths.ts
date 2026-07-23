/**
 * Frontend path helpers for the dual-route architecture:
 * - Tenant portal: `/r/{tenant-slug}/dashboard|menu|…`
 * - Customer QR:   `/r/{opaque-public-qr-id}`
 * Backend APIs stay under `/tenant/...` and `/auth/tenant/...`.
 */

export const TENANT_PORTAL_SEGMENTS = new Set([
  "analytics",
  "branch",
  "branches",
  "change-password",
  "dashboard",
  "menu",
  "notifications",
  "orders",
  "payments",
  "qr",
  "settings",
  "subscription",
]);

/** Canonical portal page for a segment (legacy aliases → current names). */
export function normalizePortalSegment(segment: string) {
  if (segment === "branches") return "branch";
  return segment;
}

export function tenantPortalPath(slug: string, ...segments: string[]) {
  const normalized = segments
    .filter(Boolean)
    .map((s) => normalizePortalSegment(s));
  const base = `/r/${encodeURIComponent(slug)}`;
  if (normalized.length === 0) return `${base}/dashboard`;
  return `${base}/${normalized.join("/")}`;
}

export function tenantActivationPath(slug: string, token: string) {
  return `/r/${encodeURIComponent(slug)}/activate/${encodeURIComponent(token)}`;
}

export function publicQrPath(publicQrId: string) {
  return `/r/${encodeURIComponent(publicQrId)}`;
}

/** 32-char hex opaque QR ids used for customer menus. */
export function looksLikePublicQrId(value: string) {
  return /^[a-f0-9]{32}$/i.test(value);
}

export function looksLikeActivationToken(value: string) {
  return /^[A-Za-z0-9_-]{20,}$/.test(value);
}

/** True when the browser path is an authenticated tenant workspace page. */
export function isTenantPortalPathname(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "tenant") {
    return (
      pathname !== "/tenant/login" &&
      !pathname.startsWith("/tenant/forgot-password") &&
      !pathname.startsWith("/tenant/reset-password") &&
      !pathname.startsWith("/tenant/activate")
    );
  }
  // /r/{slug}/dashboard|menu|…
  if (parts[0] !== "r" || parts.length < 2) return false;
  if (looksLikePublicQrId(parts[1]) && parts.length === 2) return false;
  if (parts[2] === "activate") return false;
  if (parts.length === 2) return false; // bare /r/{slug} is not a portal page
  return TENANT_PORTAL_SEGMENTS.has(parts[2]) || parts[2] === "activate";
}
