import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { api, type ApiSuccess } from "../../lib/api";

type DashboardData = {
  businessName: string;
  fullName: string;
  mustChangePassword: boolean;
  plan: {
    name: string;
    slug: string;
    maxBranches: number;
    maxItems: number | null;
  };
  branchCount: number;
  currentBranch: {
    id: string;
    name: string;
    location: string;
    qrCodeUrl: string | null;
    subscription: {
      status: string;
      expiryDate: string | null;
      plan: { name: string };
    } | null;
  } | null;
  stats: {
    branches: number;
    subscriptionStatus: string | null;
    planName: string;
  };
};

async function fetchDashboard() {
  const { data } = await api.get<ApiSuccess<DashboardData>>("/tenant/dashboard");
  return data.data;
}

export function TenantDashboardPage() {
  const { tenant, currentBranchId } = useTenantAuth();
  const dashboard = useQuery({
    queryKey: ["tenant", "dashboard", currentBranchId],
    queryFn: fetchDashboard,
  });

  const branch = dashboard.data?.currentBranch;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(135deg,rgba(212,165,116,0.16),rgba(18,26,23,0.95)_45%)] p-7">
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Welcome back
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white sm:text-5xl">
          {tenant?.fullName?.split(" ")[0] ?? "Chef"}, your kitchen is ready
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          You’re managing{" "}
          <span className="text-white">{branch?.name ?? "your branch"}</span> on the{" "}
          <span className="text-[var(--gold-soft)]">
            {dashboard.data?.stats.planName ?? tenant?.selectedPlan.name}
          </span>{" "}
          plan. Build the menu, share the QR, and keep guests scanning.
        </p>
      </section>

      {dashboard.isLoading && (
        <p className="text-[var(--muted)]">Loading dashboard…</p>
      )}
      {dashboard.isError && (
        <p className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-[var(--danger)]">
          Could not load dashboard.
        </p>
      )}

      {dashboard.data && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="Current branch"
              value={branch?.name ?? "—"}
              hint={branch?.location}
            />
            <StatCard
              label="Subscription"
              value={branch?.subscription?.status ?? "—"}
              hint={
                branch?.subscription?.expiryDate
                  ? `Expires ${new Date(branch.subscription.expiryDate).toLocaleDateString()}`
                  : "No expiry"
              }
            />
            <StatCard
              label="Branches"
              value={String(dashboard.data.stats.branches)}
              hint={`Plan: ${dashboard.data.plan.name}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ActionCard
              title="Craft your menu"
              body="Add categories and dishes for this branch. Guests will see updates instantly."
              to="/tenant/menu"
              cta="Open menu"
            />
            <ActionCard
              title="Share your QR"
              body="Download or print the branch QR so every table opens your public menu."
              to="/tenant/qr"
              cta="View QR code"
            />
          </div>

          {branch?.qrCodeUrl && (
            <div className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-[var(--muted)]">Branch QR preview</p>
                  <h3 className="font-[family-name:var(--font-display)] text-2xl text-white">
                    {branch.name}
                  </h3>
                </div>
                <img
                  src={branch.qrCodeUrl}
                  alt={`${branch.name} QR`}
                  className="h-36 w-36 rounded-2xl bg-white p-2"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-5">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
        {value}
      </p>
      {hint && <p className="mt-2 text-sm text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function ActionCard({
  title,
  body,
  to,
  cta,
}: {
  title: string;
  body: string;
  to: string;
  cta: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)] p-6">
      <h3 className="font-[family-name:var(--font-display)] text-2xl text-white">
        {title}
      </h3>
      <p className="mt-2 text-sm text-[var(--muted)]">{body}</p>
      <Link
        to={to}
        className="mt-5 inline-flex rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)]"
      >
        {cta}
      </Link>
    </div>
  );
}
