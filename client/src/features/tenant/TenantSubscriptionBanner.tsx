import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type ApiSuccess } from "../../lib/api";
import { useTenantAuth } from "./TenantAuthContext";
import { tenantPortalPath } from "../../lib/tenant-paths";

type BannerSubscription = {
  status: string;
  daysRemaining: number | null;
  showRenew: boolean;
  isFree: boolean;
  isTrial?: boolean;
  canCancel: boolean;
  retainUntil: string | null;
  retentionDaysLeft: number | null;
  retentionPurgedAt: string | null;
  branch: { name: string };
};

async function fetchSubscription() {
  const { data } = await api.get<ApiSuccess<BannerSubscription>>(
    "/tenant/subscription",
  );
  return data.data;
}

function daysPhrase(days: number | null) {
  if (days == null) return "a few days";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function TenantSubscriptionBanner() {
  const { currentBranchId , tenant} = useTenantAuth();
  const portal = (...segments: string[]) => tenantPortalPath(tenant?.slug ?? "", ...segments);

  const query = useQuery({
    queryKey: ["tenant", "subscription", currentBranchId],
    queryFn: fetchSubscription,
    enabled: Boolean(currentBranchId),
    staleTime: 30_000,
  });

  const sub = query.data;
  if (!sub) return null;

  const status = sub.status;
  const renewCta = !sub.isFree && (
    <Link
      to={portal("subscription")}
      className="font-semibold underline underline-offset-2"
    >
      Renew now
    </Link>
  );

  if (status === "TRIAL") {
    return (
      <div className="mb-6 rounded-2xl border border-[var(--gold)]/45 bg-[rgba(212,165,116,0.12)] px-4 py-3 text-sm text-[var(--gold-soft)]">
        {sub.branch.name}: your free trial has {daysPhrase(sub.daysRemaining)}{" "}
        left. Enjoy full access while it lasts.
      </div>
    );
  }

  if (status === "NEARLY_EXPIRED") {
    return (
      <div className="mb-6 rounded-2xl border border-[var(--gold)]/45 bg-[rgba(212,165,116,0.12)] px-4 py-3 text-sm text-[var(--gold-soft)]">
        {sub.branch.name}: your {sub.isTrial ? "trial" : "plan"} ends in{" "}
        {daysPhrase(sub.daysRemaining)}. {sub.isTrial ? null : renewCta}
      </div>
    );
  }

  if (status === "GRACE_PERIOD") {
    return (
      <div className="mb-6 rounded-2xl border border-[var(--danger)]/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
        {sub.branch.name}: your plan has expired and editing is paused.{" "}
        {renewCta}
      </div>
    );
  }

  if (status === "EXPIRED") {
    return (
      <div className="mb-6 rounded-2xl border border-[var(--danger)]/40 bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
        {sub.branch.name}: your plan has expired, so the public menu is offline.{" "}
        {renewCta}
      </div>
    );
  }

  if (status === "CANCELLED") {
    return (
      <div className="mb-6 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
        {sub.branch.name}: this plan was cancelled.{" "}
        {sub.retentionPurgedAt
          ? "Menu data for this location has been removed."
          : sub.retainUntil
            ? `We’ll keep your data until ${new Date(sub.retainUntil).toLocaleDateString()} (${daysPhrase(sub.retentionDaysLeft)} left).`
            : "We’ll keep your data for 30 days."}{" "}
        {renewCta}
      </div>
    );
  }

  if (status === "SUSPENDED") {
    return (
      <div className="mb-6 rounded-2xl border border-[var(--danger)]/40 bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
        {sub.branch.name}: this plan is suspended. Please contact KitchenOS
        support if you need help.
      </div>
    );
  }

  return null;
}
