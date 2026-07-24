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

function readStorage(key: string): string | null {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

function writePair(
  token: string,
  tenant: TenantSession,
  rememberMe: boolean,
) {
  const primary = rememberMe ? localStorage : sessionStorage;
  const secondary = rememberMe ? sessionStorage : localStorage;
  secondary.removeItem(TOKEN_KEY);
  secondary.removeItem(USER_KEY);
  primary.setItem(TOKEN_KEY, token);
  primary.setItem(USER_KEY, JSON.stringify(tenant));
}

export function getTenantToken() {
  return readStorage(TOKEN_KEY);
}

export function getStoredTenant(): TenantSession | null {
  const raw = readStorage(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TenantSession;
  } catch {
    return null;
  }
}

export function getCurrentBranchId() {
  return readStorage(BRANCH_KEY);
}

export function setCurrentBranchId(branchId: string) {
  // Branch preference follows whichever store holds the session token.
  if (sessionStorage.getItem(TOKEN_KEY)) {
    sessionStorage.setItem(BRANCH_KEY, branchId);
    localStorage.removeItem(BRANCH_KEY);
    return;
  }
  localStorage.setItem(BRANCH_KEY, branchId);
  sessionStorage.removeItem(BRANCH_KEY);
}

export function setTenantSession(
  token: string,
  tenant: TenantSession,
  rememberMe = true,
) {
  writePair(token, tenant, rememberMe);
  const existingBranch = getCurrentBranchId();
  const branchId =
    existingBranch && tenant.branches.some((b) => b.id === existingBranch)
      ? existingBranch
      : tenant.defaultBranchId ?? tenant.branches[0]?.id ?? "";
  if (branchId) setCurrentBranchId(branchId);
}

export function updateStoredTenant(tenant: TenantSession) {
  if (sessionStorage.getItem(TOKEN_KEY)) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(tenant));
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(tenant));
}

export function clearTenantSession() {
  for (const store of [localStorage, sessionStorage]) {
    store.removeItem(TOKEN_KEY);
    store.removeItem(USER_KEY);
    store.removeItem(BRANCH_KEY);
  }
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
