import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { AdminPagination } from "../../components/AdminPagination";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { api, type ApiSuccess } from "../../lib/api";
import { formatEtb } from "../../lib/plans";
import {
  filterOptionLabel,
  paymentMethodLabel,
  paymentStatusLabel,
} from "../../lib/status-labels";

type PaymentRow = {
  id: string;
  amount: string;
  paymentMethod: string;
  referenceNumber: string;
  screenshotUrl: string;
  durationMonths: number;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  branchName: string | null;
  tenant: {
    businessName: string;
    email: string;
    fullName: string;
  };
};

type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const tabs = ["PENDING", "APPROVED", "REJECTED", "ALL"] as const;

async function fetchPayments(status: string, page: number) {
  const { data } = await api.get<ApiSuccess<PageResult<PaymentRow>>>(
    "/admin/payments",
    { params: { status, page, pageSize: 20 } },
  );
  return data.data;
}

export function AdminPaymentsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("PENDING");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [overrideStartDate, setOverrideStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin", "payments", tab, page],
    queryFn: () => fetchPayments(tab, page),
  });

  const selected = useMemo(
    () => query.data?.items.find((p) => p.id === selectedId) ?? null,
    [query.data, selectedId],
  );

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/admin/payments/${id}/approve`, {
        overrideStartDate: overrideStartDate || null,
      });
      return data.data;
    },
    onSuccess: async () => {
      setNotice("Payment confirmed and plan extended.");
      setSelectedId(null);
      setOverrideStartDate("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) ||
              "Couldn't confirm payment"
          : "Couldn't confirm payment",
      ),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/admin/payments/${id}/reject`, { reason });
      return data.data;
    },
    onSuccess: async () => {
      setNotice("Payment declined.");
      setReason("");
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) ||
              "Couldn't decline payment"
          : "Couldn't decline payment",
      ),
  });

  async function exportCsv() {
    const response = await api.get("/admin/payments/export.csv", {
      params: { status: tab },
      responseType: "blob",
    });
    const url = URL.createObjectURL(response.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kitchenos-payments-${tab.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
            Billing
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
            Payments
          </h1>
          <p className="mt-1 text-[var(--muted)]">
            Review payment proof and confirm renewals to extend restaurant plans.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="rounded-full border border-white/15 px-4 py-2 text-sm hover:border-[var(--gold)]"
        >
          Export CSV
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setTab(item);
              setPage(1);
              setSelectedId(null);
            }}
            className={[
              "rounded-full px-4 py-2 text-sm font-medium",
              tab === item
                ? "bg-[var(--gold)] text-[var(--night)]"
                : "border border-white/15 text-[var(--muted)] hover:border-[var(--gold)]",
            ].join(" ")}
          >
            {filterOptionLabel(item, "payment")}
          </button>
        ))}
      </div>

      {notice && (
        <div className="rounded-2xl bg-[rgba(61,186,138,0.12)] px-4 py-3 text-sm text-[var(--success)]">
          {notice}
        </div>
      )}
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
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.items.map((payment) => (
                  <tr
                    key={payment.id}
                    onClick={() => setSelectedId(payment.id)}
                    className={[
                      "cursor-pointer border-t border-[var(--line)] hover:bg-white/4",
                      selectedId === payment.id
                        ? "bg-[rgba(212,165,116,0.12)]"
                        : "",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">
                        {payment.tenant.businessName}
                      </p>
                      <p className="text-[var(--muted)]">{payment.tenant.email}</p>
                    </td>
                    <td className="px-4 py-3 text-white">
                      {payment.branchName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {formatEtb(payment.amount)}
                      <span className="block text-xs text-[var(--muted)]">
                        {payment.durationMonths} mo ·{" "}
                        {paymentMethodLabel(payment.paymentMethod)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white">
                      {paymentStatusLabel(payment.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {query.data?.items.length === 0 && (
              <p className="px-4 py-10 text-center text-[var(--muted)]">
                No payments in this queue.
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
          {!selected && (
            <p className="text-[var(--muted)]">Select a payment to review.</p>
          )}
          {selected && (
            <div className="space-y-3 text-sm">
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
                {selected.tenant.businessName}
              </h2>
              <p className="text-white">{selected.branchName}</p>
              <p className="text-white">
                {formatEtb(selected.amount)} · {selected.durationMonths} months
              </p>
              <p className="text-[var(--muted)]">
                {paymentMethodLabel(selected.paymentMethod)} ·{" "}
                {selected.referenceNumber}
              </p>
              <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                <AuthenticatedImage
                  apiPath={`/admin/payments/${selected.id}/proof`}
                  alt="Payment proof"
                  className="max-h-64 w-full bg-black/25 object-contain"
                />
              </div>

              {selected.status === "PENDING" && (
                <div className="space-y-2 pt-2">
                  <label className="block text-sm">
                    <span className="mb-1.5 block text-[var(--muted)]">
                      Override start date (optional)
                    </span>
                    <input
                      type="date"
                      value={overrideStartDate}
                      onChange={(e) => setOverrideStartDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-white outline-none focus:border-[var(--gold)]"
                    />
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      Leave empty to extend from current expiry (or today if
                      expired).
                    </span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Rejection reason (optional)"
                    className="min-h-20 w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-white outline-none focus:border-[var(--gold)]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => approve.mutate(selected.id)}
                      className="rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--night)]"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => reject.mutate(selected.id)}
                      className="rounded-full border border-white/15 px-4 py-2 text-sm text-[var(--danger)] hover:border-[var(--danger)]"
                    >
                      Decline
                    </button>
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
