export type Plan = {
  id: string;
  name: string;
  slug: "free" | "basic" | "popular" | "premium";
  priceMonthly: string;
  maxBranches: number;
  maxItems: number | null;
  features: {
    customQr?: boolean;
    analytics?: string;
    support?: string;
  };
  isActive: boolean;
};

export function formatEtb(amount: string | number) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 0,
  }).format(value);
}

export function planLimitsLabel(plan: Plan) {
  const branches =
    plan.maxBranches < 0 ? "Unlimited branches" : `${plan.maxBranches} branch${plan.maxBranches > 1 ? "es" : ""}`;
  const items =
    plan.maxItems == null ? "Unlimited items" : `${plan.maxItems} menu items`;
  return `${branches} · ${items}`;
}
