/** Predictable, tenant-safe cache key builders. */

export const CacheKeys = {
  plansActive: () => "plans:active",
  publicMenuByQr: (publicQrId: string) => `public:menu:qr:${publicQrId}`,
  publicMenuBySlug: (tenantSlug: string, branchSlug?: string) =>
    branchSlug
      ? `public:menu:slug:${tenantSlug}:${branchSlug}`
      : `public:menu:slug:${tenantSlug}:default`,
  adminDashboard: () => "admin:dashboard:stats",
  tenantSettings: (tenantId: string) => `tenant:settings:${tenantId}`,
  branchAnalytics: (branchId: string, tier: string) =>
    `tenant:analytics:${branchId}:${tier}`,
} as const;

/** TTLs in seconds — tuned for freshness vs load. */
export const CacheTtl = {
  plans: 10 * 60,
  publicMenu: 90,
  publicMenuUnavailable: 30,
  adminDashboard: 45,
  tenantSettings: 120,
  branchAnalytics: 90,
} as const;
