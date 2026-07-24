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
