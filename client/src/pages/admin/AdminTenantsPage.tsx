import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { AdminPagination } from "../../components/AdminPagination";
import { BackButton } from "../../components/BackButton";
import { useAdminAuth } from "../../features/admin/AdminAuthContext";
import { api, type ApiSuccess } from "../../lib/api";

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
      await queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "tenant", selectedId],
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
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
      await queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Delete failed"
          : "Delete failed",
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
        <BackButton fallbackTo="/admin" className="mb-3" />
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Accounts
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
          Tenants
        </h1>
        <p className="mt-1 text-[var(--muted)]">
          Browse restaurant accounts, suspend access, or inspect branches.
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
                {s}
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
                    <td className="px-4 py-3 text-white">{tenant.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.data?.items.length === 0 && (
              <p className="px-4 py-10 text-center text-[var(--muted)]">
                No tenants match these filters.
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
            <p className="text-[var(--muted)]">Select a tenant to view details.</p>
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
                Plan: {detail.data.plan.name} · Status: {detail.data.status}
              </p>
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
                      {branch.subscriptionStatus ?? "—"}
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
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${detail.data.businessName}? This cannot be undone.`,
                            )
                          ) {
                            remove.mutate();
                          }
                        }}
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
    </div>
  );
}
