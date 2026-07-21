import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type ApiSuccess } from "../../lib/api";
import { useTenantAuth } from "./TenantAuthContext";

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

export function TenantSubscriptionBanner() {
  const { currentBranchId } = useTenantAuth();

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
      to="/tenant/subscription"
      className="font-semibold underline underline-offset-2"
    >
      Renew now
    </Link>
  );

  if (status === "TRIAL") {
    return (
      <div className="mb-6 rounded-2xl border border-[var(--gold)]/45 bg-[rgba(212,165,116,0.12)] px-4 py-3 text-sm text-[var(--gold-soft)]">
        {sub.branch.name}: 14-day trial — {sub.daysRemaining ?? "a few"} day(s)
        remaining. Full access while the trial is active.
      </div>
    );
  }

  if (status === "NEARLY_EXPIRED") {
    return (
      <div className="mb-6 rounded-2xl border border-[var(--gold)]/45 bg-[rgba(212,165,116,0.12)] px-4 py-3 text-sm text-[var(--gold-soft)]">
        {sub.branch.name}:{" "}
        {sub.isTrial ? "trial" : "subscription"} expires in{" "}
        {sub.daysRemaining ?? "a few"} day(s). {sub.isTrial ? null : renewCta}
      </div>
    );
  }

  if (status === "GRACE_PERIOD") {
    return (
      <div className="mb-6 rounded-2xl border border-[var(--danger)]/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
        {sub.branch.name}: grace period active — editing is locked. {renewCta}
      </div>
    );
  }

  if (status === "EXPIRED") {
    return (
      <div className="mb-6 rounded-2xl border border-[var(--danger)]/40 bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
        {sub.branch.name}: subscription expired. Public menu is unavailable.{" "}
        {renewCta}
      </div>
    );
  }

  if (status === "CANCELLED") {
    return (
      <div className="mb-6 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-[var(--muted)]">
        {sub.branch.name}: subscription cancelled.{" "}
        {sub.retentionPurgedAt
          ? "Menu data for this branch has been removed after the retention window."
          : sub.retainUntil
            ? `Data retained until ${new Date(sub.retainUntil).toLocaleDateString()} (${sub.retentionDaysLeft ?? 0} day(s) left).`
            : "Data retained for 30 days."}{" "}
        {renewCta}
      </div>
    );
  }

  if (status === "SUSPENDED") {
    return (
      <div className="mb-6 rounded-2xl border border-[var(--danger)]/40 bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
        {sub.branch.name}: subscription suspended by admin. Contact support if
        this looks wrong.
      </div>
    );
  }

  return null;
}
