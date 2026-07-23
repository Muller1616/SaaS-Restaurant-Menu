import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { AdminPagination } from "../../components/AdminPagination";
import { api, type ApiSuccess } from "../../lib/api";
import { formatAdminDate, formatAdminDateTime } from "../../lib/datetime";
import { formatEtb } from "../../lib/plans";
import {
  activityActorLabel,
  filterOptionLabel,
  paymentStatusLabel,
  subscriptionEventLabel,
  subscriptionStatusLabel,
} from "../../lib/status-labels";

const SUBSCRIPTION_PAGE_SIZE = 5;

type SubRow = {
  id: string;
  status: string;
  storedStatus: string;
  startDate: string;
  expiryDate: string | null;
  createdAt: string;
  cancelledAt: string | null;
  isAutoRenew: boolean;
  daysRemaining: number | null;
  daysExpired: number;
  subscriptionAgeDays: number;
  renewalEligible: boolean;
  isFreePlan: boolean;
  billingCycleMonths: number | null;
  paymentStatus: string | null;
  currentPeriod: { startDate: string; endDate: string | null };
  plan: { name: string; slug: string; priceMonthly: string };
  branch: { id: string; name: string };
  tenant: {
    id: string;
    businessName: string;
    email: string;
    fullName: string;
    registrationDate: string;
  };
  latestPayment: {
    id: string;
    status: string;
    amount: string;
    durationMonths: number;
    createdAt: string;
  } | null;
};

type SubscriptionStats = {
  total: number;
  active: number;
  trial: number;
  pending: number;
  suspended: number;
  cancelled: number;
  expired: number;
  gracePeriod: number;
  renewed: number;
  renewedThisMonth: number;
  monthlyRevenue: string;
  annualRevenue: string;
  freePlanUsers: number;
  paidPlanUsers: number;
};

type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type HistoryEvent = {
  id: string;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  summary: string;
  actorType: string | null;
  createdAt: string;
};

type HistoryPayload = {
  branch: { id: string; name: string; tenant: { businessName: string } };
  subscription: {
    id: string;
    status: string;
    plan: { name: string };
  } | null;
  events: HistoryEvent[];
};

const filters = [
  "ALL",
  "TRIAL",
  "ACTIVE",
  "NEARLY_EXPIRED",
  "GRACE_PERIOD",
  "EXPIRED",
  "SUSPENDED",
  "CANCELLED",
] as const;

function statusTone(status: string) {
  switch (status) {
    case "ACTIVE":
    case "TRIAL":
      return "border-[rgba(61,186,138,0.35)] bg-[rgba(61,186,138,0.12)] text-[var(--success)]";
    case "NEARLY_EXPIRED":
    case "GRACE_PERIOD":
      return "border-[rgba(212,165,116,0.4)] bg-[rgba(212,165,116,0.12)] text-[var(--gold-soft)]";
    case "EXPIRED":
    case "SUSPENDED":
    case "CANCELLED":
      return "border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.12)] text-[var(--danger)]";
    default:
      return "border-white/15 bg-white/5 text-white";
  }
}

function billingCycleLabel(months: number | null, isFree: boolean) {
  if (isFree) return "Free · no billing cycle";
  if (months == null) return "Monthly";
  if (months === 1) return "1 month";
  if (months === 3) return "3 months";
  if (months === 6) return "6 months";
  if (months === 12) return "12 months";
  return `${months} months`;
}

function remainingLabel(row: SubRow) {
  if (row.isFreePlan && !row.expiryDate) return "No expiry";
  if (row.daysExpired > 0) {
    return `Expired ${row.daysExpired} day${row.daysExpired === 1 ? "" : "s"} ago`;
  }
  if (row.daysRemaining == null) return "—";
  if (row.daysRemaining === 0) return "Expires today";
  return `${row.daysRemaining} day${row.daysRemaining === 1 ? "" : "s"} left`;
}

async function fetchSubs(status: string, page: number) {
  const { data } = await api.get<ApiSuccess<PageResult<SubRow>>>(
    "/admin/subscriptions",
    { params: { status, page, pageSize: SUBSCRIPTION_PAGE_SIZE } },
  );
  return data.data;
}

async function fetchStats() {
  const { data } = await api.get<ApiSuccess<SubscriptionStats>>(
    "/admin/subscriptions/stats",
  );
  return data.data;
}

async function fetchHistory(id: string) {
  const { data } = await api.get<ApiSuccess<HistoryPayload>>(
    `/admin/subscriptions/${id}/history`,
  );
  return data.data;
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
      <p className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
        {label}
      </p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export function AdminSubscriptionsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [page, setPage] = useState(1);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = useQuery({
    queryKey: ["admin", "subscription-stats"],
    queryFn: fetchStats,
    staleTime: 30_000,
  });

  const query = useQuery({
    queryKey: ["admin", "subscriptions", filter, page],
    queryFn: () => fetchSubs(filter, page),
  });

  useEffect(() => {
    if (!query.data) return;
    if (page > query.data.totalPages) {
      setPage(Math.max(1, query.data.totalPages));
    }
  }, [query.data, page]);

  const history = useQuery({
    queryKey: ["admin", "subscription-history", historyId],
    queryFn: () => fetchHistory(historyId!),
    enabled: Boolean(historyId),
  });

  const extend = useMutation({
    mutationFn: async ({ id, months }: { id: string; months: number }) => {
      await api.post(`/admin/subscriptions/${id}/extend`, { months });
    },
    onSuccess: async (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "subscription-stats"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "subscription-history", vars.id],
      });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Extend failed"
          : "Extend failed",
      ),
  });

  const setStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
    }) => {
      await api.post(`/admin/subscriptions/${id}/status`, { status });
    },
    onSuccess: async (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "subscription-stats"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "subscription-history", vars.id],
      });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Update failed"
          : "Update failed",
      ),
  });

  const busy = extend.isPending || setStatus.isPending;
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Billing lifecycle
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
          Subscriptions
        </h1>
        <p className="mt-1 text-[var(--muted)]">
          Live branch plans, renewal history, and billing actions from the
          database.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Total" value={String(s?.total ?? "—")} />
        <StatCard
          label="Active"
          value={String(s?.active ?? "—")}
          hint={s ? `${s.trial} on trial` : undefined}
        />
        <StatCard
          label="Pending review"
          value={String(s?.pending ?? "—")}
          hint="Tenant registrations awaiting approval"
        />
        <StatCard label="Suspended" value={String(s?.suspended ?? "—")} />
        <StatCard label="Cancelled" value={String(s?.cancelled ?? "—")} />
        <StatCard
          label="Expired"
          value={String(s?.expired ?? "—")}
          hint={s ? `${s.gracePeriod} in grace` : undefined}
        />
        <StatCard
          label="Renewed"
          value={String(s?.renewed ?? "—")}
          hint={s ? `${s.renewedThisMonth} this month` : undefined}
        />
        <StatCard
          label="Monthly revenue"
          value={s ? formatEtb(s.monthlyRevenue) : "—"}
          hint={s ? `YTD ${formatEtb(s.annualRevenue)}` : undefined}
        />
        <StatCard
          label="Free plan"
          value={String(s?.freePlanUsers ?? "—")}
          hint="Active / trial / grace"
        />
        <StatCard
          label="Paid plan"
          value={String(s?.paidPlanUsers ?? "—")}
          hint="Active / trial / grace"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setFilter(item);
              setPage(1);
            }}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide",
              filter === item
                ? "bg-[var(--gold)] text-[var(--night)]"
                : "border border-white/15 text-[var(--muted)] hover:border-[var(--gold)]",
            ].join(" ")}
          >
            {filterOptionLabel(item, "subscription")}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          {query.isLoading && (
            <p className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] px-4 py-10 text-center text-[var(--muted)]">
              Loading subscriptions…
            </p>
          )}

          {query.data?.items.map((row) => (
            <article
              key={row.id}
              className={[
                "rounded-[1.75rem] border bg-[var(--panel)] p-5 transition",
                historyId === row.id
                  ? "border-[var(--gold)]/50 bg-[rgba(212,165,116,0.08)]"
                  : "border-[var(--line)]",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] tracking-[0.22em] text-[var(--muted)] uppercase">
                    Restaurant
                  </p>
                  <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">
                    {row.tenant.businessName}
                  </h2>
                  <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
                    {row.tenant.fullName} · {row.tenant.email}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-semibold",
                      statusTone(row.status),
                    ].join(" ")}
                  >
                    {subscriptionStatusLabel(row.status)}
                  </span>
                  {row.renewalEligible && (
                    <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--muted)]">
                      Renewal eligible
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Meta label="Branch" value={row.branch.name} />
                <Meta
                  label="Plan"
                  value={row.plan.name}
                  hint={`${formatEtb(row.plan.priceMonthly)}/mo`}
                />
                <Meta
                  label="Billing cycle"
                  value={billingCycleLabel(row.billingCycleMonths, row.isFreePlan)}
                />
                <Meta
                  label="Registered"
                  value={formatAdminDate(row.tenant.registrationDate)}
                />
                <Meta
                  label="Period start"
                  value={formatAdminDate(row.currentPeriod.startDate)}
                />
                <Meta
                  label="Expires"
                  value={formatAdminDate(row.currentPeriod.endDate)}
                  hint={remainingLabel(row)}
                />
                <Meta
                  label="Subscription age"
                  value={`${row.subscriptionAgeDays} day${row.subscriptionAgeDays === 1 ? "" : "s"}`}
                />
                <Meta
                  label="Payment status"
                  value={
                    row.paymentStatus
                      ? paymentStatusLabel(row.paymentStatus)
                      : "No payment yet"
                  }
                  hint={
                    row.latestPayment
                      ? `${formatEtb(row.latestPayment.amount)} · ${formatAdminDate(row.latestPayment.createdAt)}`
                      : undefined
                  }
                />
                <Meta
                  label="Auto-renew"
                  value={row.isAutoRenew ? "Enabled" : "Off"}
                />
              </div>

              <div className="mt-5 border-t border-[var(--line)] pt-4">
                <p className="mb-2 text-[11px] tracking-[0.22em] text-[var(--muted)] uppercase">
                  Actions
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setHistoryId(row.id)}
                    className="rounded-full border border-[var(--gold)]/40 px-3.5 py-1.5 text-xs font-semibold text-[var(--gold-soft)] hover:border-[var(--gold)] disabled:opacity-40"
                  >
                    History
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => extend.mutate({ id: row.id, months: 1 })}
                    className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white hover:border-[var(--gold)] disabled:opacity-40"
                  >
                    Extend +1 mo
                  </button>
                  <button
                    type="button"
                    disabled={busy || row.storedStatus === "SUSPENDED"}
                    onClick={() =>
                      setStatus.mutate({ id: row.id, status: "SUSPENDED" })
                    }
                    className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-40"
                  >
                    Suspend
                  </button>
                  <button
                    type="button"
                    disabled={busy || row.storedStatus === "ACTIVE"}
                    onClick={() =>
                      setStatus.mutate({ id: row.id, status: "ACTIVE" })
                    }
                    className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white hover:border-[var(--gold)] disabled:opacity-40"
                  >
                    Activate
                  </button>
                  <button
                    type="button"
                    disabled={busy || row.storedStatus === "CANCELLED"}
                    onClick={() =>
                      setStatus.mutate({ id: row.id, status: "CANCELLED" })
                    }
                    className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white hover:border-[var(--gold)] disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </article>
          ))}

          {query.data?.items.length === 0 && (
            <p className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] px-4 py-10 text-center text-[var(--muted)]">
              No subscriptions match this filter.
            </p>
          )}

          {query.data && (
            <AdminPagination
              page={query.data.page}
              totalPages={query.data.totalPages}
              total={query.data.total}
              onPageChange={setPage}
            />
          )}
        </div>

        <aside className="h-fit rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5 xl:sticky xl:top-6">
          {!historyId && (
            <p className="text-sm text-[var(--muted)]">
              Choose <span className="text-white">History</span> on a
              subscription to review registration → approval → renewals →
              expiration for that branch.
            </p>
          )}
          {historyId && history.isLoading && (
            <p className="text-sm text-[var(--muted)]">Loading history…</p>
          )}
          {history.data && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
                  Renewal history
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
                  {history.data.branch.name}
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  {history.data.branch.tenant.businessName}
                  {history.data.subscription
                    ? ` · ${history.data.subscription.plan.name}`
                    : ""}
                </p>
              </div>
              <ul className="space-y-3">
                {history.data.events.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-2xl border border-[var(--line)] bg-black/20 px-3 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--gold-soft)]">
                        {subscriptionEventLabel(event.kind)}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {formatAdminDateTime(event.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-white">{event.summary}</p>
                    {(event.fromStatus || event.toStatus) && (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {event.fromStatus
                          ? subscriptionStatusLabel(event.fromStatus)
                          : "—"}{" "}
                        →{" "}
                        {event.toStatus
                          ? subscriptionStatusLabel(event.toStatus)
                          : "—"}
                        {event.actorType
                          ? ` · ${activityActorLabel(event.actorType)}`
                          : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {history.data.events.length === 0 && (
                <p className="text-sm text-[var(--muted)]">
                  No history events yet for this branch.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-black/20 px-3 py-3">
      <p className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
        {label}
      </p>
      <p className="mt-1 font-medium text-white">{value}</p>
      {hint && <p className="text-xs text-[var(--gold-soft)]">{hint}</p>}
    </div>
  );
}
