export type TenantBranch = {
  id: string;
  name: string;
  location: string;
  city: string | null;
  region: string | null;
  country: string | null;
  phone: string | null;
  managerName: string | null;
  slug: string;
  qrCodeUrl: string | null;
  isActive: boolean;
  isDefault: boolean;
  subscription: {
    id: string;
    status: string;
    startDate: string;
    expiryDate: string | null;
    plan: {
      id: string;
      name: string;
      slug: string;
      priceMonthly: string;
      maxBranches: number;
      maxItems: number | null;
    };
  } | null;
};

export type TenantSession = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  businessLocation: string;
  slug: string;
  status: string;
  mustChangePassword: boolean;
  emailNotificationsEnabled: boolean;
  selectedPlan: {
    id: string;
    name: string;
    slug: string;
    priceMonthly: string;
    maxBranches: number;
    maxItems: number | null;
    features?: {
      customQr?: boolean;
      analytics?: string;
      support?: string;
    };
  };
  branches: TenantBranch[];
  defaultBranchId: string | null;
};

const TOKEN_KEY = "kitchenos_tenant_token";
const USER_KEY = "kitchenos_tenant_user";
const BRANCH_KEY = "kitchenos_current_branch_id";

export function getTenantToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredTenant(): TenantSession | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TenantSession;
  } catch {
    return null;
  }
}

export function getCurrentBranchId() {
  return localStorage.getItem(BRANCH_KEY);
}

export function setCurrentBranchId(branchId: string) {
  localStorage.setItem(BRANCH_KEY, branchId);
}

export function setTenantSession(token: string, tenant: TenantSession) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(tenant));
  const branchId =
    getCurrentBranchId() &&
    tenant.branches.some((b) => b.id === getCurrentBranchId())
      ? getCurrentBranchId()!
      : tenant.defaultBranchId ?? tenant.branches[0]?.id ?? "";
  if (branchId) setCurrentBranchId(branchId);
}

export function updateStoredTenant(tenant: TenantSession) {
  localStorage.setItem(USER_KEY, JSON.stringify(tenant));
}

export function clearTenantSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(BRANCH_KEY);
}

/** True when a JWT is missing, malformed, wrong role, or past `exp`. */
export function isTenantTokenExpired(token: string | null | undefined) {
  if (!token) return true;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return true;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number; role?: string };
    if (payload.role && payload.role !== "TENANT") return true;
    if (typeof payload.exp !== "number") return true;
    return payload.exp * 1000 <= Date.now() - 5_000;
  } catch {
    return true;
  }
}

/**
 * Safe post-login path inside the tenant portal for the signed-in slug.
 * Rejects admin paths, protocol-relative URLs, and other tenants' portals.
 */
export function safeTenantReturnPath(
  pathname: string | null | undefined,
  sessionSlug: string | undefined,
) {
  const fallback = sessionSlug
    ? `/r/${encodeURIComponent(sessionSlug)}/dashboard`
    : "/tenant/login";
  if (!pathname || !sessionSlug) return fallback;
  if (pathname.includes("//")) return fallback;
  if (pathname.startsWith("/admin")) return fallback;
  if (pathname.startsWith("/tenant/login") || pathname === "/tenant") {
    return fallback;
  }
  const portalPrefix = `/r/${sessionSlug}`;
  if (
    pathname === portalPrefix ||
    pathname.startsWith(`${portalPrefix}/`)
  ) {
    return pathname;
  }
  return fallback;
}

