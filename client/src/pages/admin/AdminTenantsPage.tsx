import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { AdminPagination } from "../../components/AdminPagination";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useAdminAuth } from "../../features/admin/AdminAuthContext";
import { api, type ApiSuccess } from "../../lib/api";
import {
  filterOptionLabel,
  subscriptionStatusLabel,
  tenantStatusLabel,
} from "../../lib/status-labels";

type TenantRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  businessLocation: string;
  status: string;
  suspendedReason: string | null;
  createdAt: string;
  plan: { name: string; slug: string };
  branchCount: number;
};

type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type TenantDetail = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  businessLocation: string;
  businessDescription: string | null;
  status: string;
  activatedAt: string | null;
  mustChangePassword: boolean;
  suspendedReason: string | null;
  plan: { name: string; slug: string; priceMonthly: string };
  branches: Array<{
    id: string;
    name: string;
    location: string;
    itemCount: number;
    subscriptionStatus: string | null;
    planName: string | null;
  }>;
};

type ActivationResendResult = {
  email: string;
  businessName: string;
  temporaryPassword: string;
  activationUrl: string;
  loginUrl: string;
  emailDelivered?: boolean;
};

async function fetchTenants(params: {
  status: string;
  plan: string;
  q: string;
  from: string;
  to: string;
  page: number;
}) {
  const { data } = await api.get<ApiSuccess<PageResult<TenantRow>>>(
    "/admin/tenants",
    { params: { ...params, pageSize: 20 } },
  );
  return data.data;
}

export function AdminTenantsPage() {
  const { admin } = useAdminAuth();
  const isSuperAdmin = admin?.role === "SUPER_ADMIN";
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("ALL");
  const [plan, setPlan] = useState("ALL");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activationCreds, setActivationCreds] =
    useState<ActivationResendResult | null>(null);

  const list = useQuery({
    queryKey: ["admin", "tenants", status, plan, q, from, to, page],
    queryFn: () => fetchTenants({ status, plan, q, from, to, page }),
  });

  const detail = useQuery({
    queryKey: ["admin", "tenant", selectedId],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<TenantDetail>>(
        `/admin/tenants/${selectedId}`,
      );
      return data.data;
    },
    enabled: Boolean(selectedId),
  });

  const setTenantStatus = useMutation({
    mutationFn: async (next: "ACTIVE" | "SUSPENDED") => {
      await api.post(`/admin/tenants/${selectedId}/status`, {
        status: next,
        reason,
      });
    },
    onSuccess: async () => {
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "tenant", selectedId],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Update failed"
          : "Update failed",
      ),
  });

  const remove = useMutation({
    mutationFn: async () => api.delete(`/admin/tenants/${selectedId}`),
    onSuccess: async () => {
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Delete failed"
          : "Delete failed",
      ),
  });

  const resendActivation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiSuccess<ActivationResendResult>>(
        `/admin/tenants/${selectedId}/resend-activation`,
      );
      return data.data;
    },
    onSuccess: (data) => {
      setActivationCreds(data);
      void queryClient.invalidateQueries({
        queryKey: ["admin", "tenant", selectedId],
      });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) ||
              "Could not resend activation"
          : "Could not resend activation",
      ),
  });

  const selected = useMemo(
    () => list.data?.items.find((t) => t.id === selectedId) ?? null,
    [list.data, selectedId],
  );

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Accounts
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
          Restaurants
        </h1>
        <p className="mt-1 text-[var(--muted)]">
          Review restaurant accounts, pause access when needed, or check their
          locations.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            resetPage();
          }}
          placeholder="Search business, email, owner…"
          className="min-w-[220px] flex-1 rounded-xl border border-[var(--line)] bg-black/25 px-4 py-2 text-sm text-white outline-none focus:border-[var(--gold)]"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            resetPage();
          }}
          className="rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-[var(--gold)]"
        >
          {["ALL", "ACTIVE", "PENDING_APPROVAL", "SUSPENDED", "REJECTED"].map(
            (s) => (
              <option key={s} value={s}>
                {filterOptionLabel(s, "tenant")}
              </option>
            ),
          )}
        </select>
        <select
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value);
            resetPage();
          }}
          className="rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-[var(--gold)]"
        >
          {["ALL", "free", "basic", "popular", "premium"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            resetPage();
          }}
          className="rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-[var(--gold)]"
          title="Registered from"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            resetPage();
          }}
          className="rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-[var(--gold)]"
          title="Registered to"
        />
      </div>

      {error && (
        <div className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--panel-2)] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((tenant) => (
                  <tr
                    key={tenant.id}
                    onClick={() => setSelectedId(tenant.id)}
                    className={[
                      "cursor-pointer border-t border-[var(--line)] hover:bg-white/4",
                      selectedId === tenant.id
                        ? "bg-[rgba(212,165,116,0.12)]"
                        : "",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">
                        {tenant.businessName}
                      </p>
                      <p className="text-[var(--muted)]">
                        {tenant.branchCount} branches ·{" "}
                        {new Date(tenant.createdAt).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white">{tenant.fullName}</p>
                      <p className="text-[var(--muted)]">{tenant.email}</p>
                    </td>
                    <td className="px-4 py-3 text-white">{tenant.plan.name}</td>
                    <td className="px-4 py-3 text-white">
                      {tenantStatusLabel(tenant.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.data?.items.length === 0 && (
              <p className="px-4 py-10 text-center text-[var(--muted)]">
                No restaurants match these filters.
              </p>
            )}
          </div>
          {list.data && (
            <AdminPagination
              page={list.data.page}
              totalPages={list.data.totalPages}
              total={list.data.total}
              onPageChange={setPage}
            />
          )}
        </div>

        <aside className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
          {!selected && (
            <p className="text-[var(--muted)]">
              Select a restaurant to view details.
            </p>
          )}
          {selected && detail.data && (
            <div className="space-y-3 text-sm">
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
                {detail.data.businessName}
              </h2>
              <p className="text-white">
                {detail.data.fullName} · {detail.data.email}
              </p>
              <p className="text-white">{detail.data.phone}</p>
              <p className="text-[var(--muted)]">{detail.data.businessLocation}</p>
              <p className="text-white">
                Plan: {detail.data.plan.name} · Status:{" "}
                {tenantStatusLabel(detail.data.status)}
              </p>
              {detail.data.status === "ACTIVE" && (
                <p className="text-[var(--muted)]">
                  Activation:{" "}
                  {detail.data.activatedAt
                    ? `Completed ${new Date(detail.data.activatedAt).toLocaleString()}`
                    : "Pending — owner must open the activation email"}
                </p>
              )}
              {detail.data.suspendedReason && (
                <p className="text-[var(--danger)]">
                  Reason: {detail.data.suspendedReason}
                </p>
              )}

              <div className="rounded-xl bg-[var(--panel-2)] p-3">
                <p className="mb-2 font-medium text-white">Branches</p>
                <ul className="space-y-1 text-[var(--muted)]">
                  {detail.data.branches.map((branch) => (
                    <li key={branch.id}>
                      {branch.name} · {branch.itemCount} items ·{" "}
                      {subscriptionStatusLabel(
                        branch.subscriptionStatus ?? "NO_SUBSCRIPTION",
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {(detail.data.status === "ACTIVE" ||
                detail.data.status === "SUSPENDED") && (
                <div className="space-y-2 pt-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Suspend reason (optional)"
                    className="min-h-20 w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-white outline-none focus:border-[var(--gold)]"
                  />
                  <div className="flex flex-wrap gap-2">
                    {detail.data.status === "ACTIVE" &&
                      !detail.data.activatedAt && (
                        <button
                          type="button"
                          onClick={() => resendActivation.mutate()}
                          disabled={resendActivation.isPending}
                          className="rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--night)] disabled:opacity-60"
                        >
                          {resendActivation.isPending
                            ? "Sending…"
                            : "Resend activation"}
                        </button>
                      )}
                    {detail.data.status === "ACTIVE" ? (
                      <button
                        type="button"
                        onClick={() => setTenantStatus.mutate("SUSPENDED")}
                        className="rounded-full border border-white/15 px-4 py-2 text-sm text-[var(--danger)] hover:border-[var(--danger)]"
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTenantStatus.mutate("ACTIVE")}
                        className="rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--night)]"
                      >
                        Activate
                      </button>
                    )}
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="rounded-full border border-white/15 px-4 py-2 text-sm hover:border-[var(--gold)]"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {activationCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
            <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
              Activation resent
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
              {activationCreds.businessName}
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {activationCreds.emailDelivered === false
                ? "Email could not be delivered. Copy these credentials now."
                : "A new activation email was sent. Copy the link and temporary password — shown once."}
            </p>
            <div className="mt-5 space-y-2 rounded-2xl border border-[var(--line)] bg-black/25 p-4 text-sm text-white">
              <p>
                <span className="text-[var(--muted)]">Email:</span>{" "}
                {activationCreds.email}
              </p>
              <p>
                <span className="text-[var(--muted)]">Temporary password:</span>{" "}
                <span className="font-mono text-[var(--gold-soft)]">
                  {activationCreds.temporaryPassword}
                </span>
              </p>
              <p className="break-all">
                <span className="text-[var(--muted)]">Activation link:</span>{" "}
                {activationCreds.activationUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivationCreds(null)}
              className="mt-5 rounded-full border border-white/15 px-5 py-2.5 text-sm hover:border-[var(--gold)]"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete && Boolean(detail.data)}
        title="Delete restaurant"
        message={
          detail.data
            ? `Delete ${detail.data.businessName}? This cannot be undone.`
            : "Delete this restaurant?"
        }
        confirmLabel="Delete forever"
        danger
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          remove.mutate();
        }}
      />
    </div>
  );
}
