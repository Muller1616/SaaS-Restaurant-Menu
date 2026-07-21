import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { AdminPagination } from "../../components/AdminPagination";
import { api, type ApiSuccess } from "../../lib/api";
import { formatEtb } from "../../lib/plans";
import {
  activityActorLabel,
  filterOptionLabel,
  subscriptionEventLabel,
  subscriptionStatusLabel,
} from "../../lib/status-labels";

type SubRow = {
  id: string;
  status: string;
  startDate: string;
  expiryDate: string | null;
  daysRemaining: number | null;
  plan: { name: string; priceMonthly: string };
  branch: { id: string; name: string };
  tenant: { businessName: string; email: string; fullName: string };
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

async function fetchSubs(status: string, page: number) {
  const { data } = await api.get<ApiSuccess<PageResult<SubRow>>>(
    "/admin/subscriptions",
    { params: { status, page, pageSize: 20 } },
  );
  return data.data;
}

async function fetchHistory(id: string) {
  const { data } = await api.get<ApiSuccess<HistoryPayload>>(
    `/admin/subscriptions/${id}/history`,
  );
  return data.data;
}

export function AdminSubscriptionsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [page, setPage] = useState(1);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin", "subscriptions", filter, page],
    queryFn: () => fetchSubs(filter, page),
  });

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
      await queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      await queryClient.invalidateQueries({
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
      await queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      await queryClient.invalidateQueries({
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
          Track branch plans, review history, and take quick billing actions.
        </p>
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
          <div className="overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--panel-2)] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expiry</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.items.map((row) => (
                  <tr
                    key={row.id}
                    className={[
                      "border-t border-[var(--line)] hover:bg-white/4",
                      historyId === row.id
                        ? "bg-[rgba(212,165,116,0.12)]"
                        : "",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">
                        {row.tenant.businessName}
                      </p>
                      <p className="text-[var(--muted)]">{row.tenant.email}</p>
                    </td>
                    <td className="px-4 py-3 text-white">{row.branch.name}</td>
                    <td className="px-4 py-3 text-white">
                      {row.plan.name}
                      <span className="block text-xs text-[var(--muted)]">
                        {formatEtb(row.plan.priceMonthly)}/mo
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white">
                      {subscriptionStatusLabel(row.status)}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {row.expiryDate
                        ? new Date(row.expiryDate).toLocaleDateString()
                        : "—"}
                      {row.daysRemaining != null && (
                        <span className="block text-xs text-[var(--muted)]">
                          {row.daysRemaining}d
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setHistoryId(row.id)}
                          className="rounded-full border border-white/15 px-2 py-1 text-xs text-[var(--gold-soft)] hover:border-[var(--gold)]"
                        >
                          History
                        </button>
                        <button
                          type="button"
                          onClick={() => extend.mutate({ id: row.id, months: 1 })}
                          className="rounded-full border border-white/15 px-2 py-1 text-xs text-white hover:border-[var(--gold)]"
                        >
                          +1 mo
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setStatus.mutate({ id: row.id, status: "SUSPENDED" })
                          }
                          className="rounded-full border border-white/15 px-2 py-1 text-xs text-[var(--danger)] hover:border-[var(--danger)]"
                        >
                          Suspend
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setStatus.mutate({ id: row.id, status: "ACTIVE" })
                          }
                          className="rounded-full border border-white/15 px-2 py-1 text-xs text-white hover:border-[var(--gold)]"
                        >
                          Activate
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setStatus.mutate({ id: row.id, status: "CANCELLED" })
                          }
                          className="rounded-full border border-white/15 px-2 py-1 text-xs text-white hover:border-[var(--gold)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {query.data?.items.length === 0 && (
              <p className="px-4 py-10 text-center text-[var(--muted)]">
                No subscriptions match this filter.
              </p>
            )}
          </div>

          {query.data && (
            <AdminPagination
              page={query.data.page}
              totalPages={query.data.totalPages}
              total={query.data.total}
              onPageChange={setPage}
            />
          )}
        </div>

        <aside className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
          {!historyId && (
            <p className="text-sm text-[var(--muted)]">
              Choose <span className="text-white">History</span> on a row to see
              that branch’s subscription timeline.
            </p>
          )}
          {historyId && history.isLoading && (
            <p className="text-sm text-[var(--muted)]">Loading history…</p>
          )}
          {history.data && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
                  Timeline
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
                        {new Date(event.createdAt).toLocaleString()}
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
