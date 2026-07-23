import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { AdminPagination } from "../../components/AdminPagination";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { api, type ApiSuccess } from "../../lib/api";
import { formatAdminDateTime } from "../../lib/datetime";
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
  adminNotes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  branchName: string | null;
  approvedByName: string | null;
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

function statusTone(status: string) {
  switch (status) {
    case "APPROVED":
      return "border-[rgba(61,186,138,0.35)] bg-[rgba(61,186,138,0.12)] text-[var(--success)]";
    case "REJECTED":
      return "border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.12)] text-[var(--danger)]";
    case "PENDING":
      return "border-[rgba(212,165,116,0.4)] bg-[rgba(212,165,116,0.12)] text-[var(--gold-soft)]";
    default:
      return "border-white/15 bg-white/5 text-white";
  }
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] py-2.5 last:border-0">
      <dt className="shrink-0 text-[var(--muted)]">{label}</dt>
      <dd className="text-right font-medium text-white break-all">
        {value?.trim() ? value : "—"}
      </dd>
    </div>
  );
}

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
      void queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
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
      void queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
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
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                          statusTone(payment.status),
                        ].join(" ")}
                      >
                        {paymentStatusLabel(payment.status)}
                      </span>
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

        <aside className="h-fit rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5 xl:sticky xl:top-6">
          {!selected && (
            <div className="py-8 text-center">
              <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
                Payment detail
              </p>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Select a payment from the list to review proof, metadata, and
                take action.
              </p>
            </div>
          )}
          {selected && (
            <div className="space-y-5 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
                    Payment review
                  </p>
                  <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">
                    {selected.tenant.businessName}
                  </h2>
                  <p className="mt-1 text-[var(--muted)]">
                    Submitted {formatAdminDateTime(selected.createdAt)}
                  </p>
                </div>
                <span
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    statusTone(selected.status),
                  ].join(" ")}
                >
                  {paymentStatusLabel(selected.status)}
                </span>
              </div>

              <div className="rounded-2xl border border-[var(--line)] bg-black/20 px-4 py-3">
                <p className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
                  Amount
                </p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-3xl text-white">
                  {formatEtb(selected.amount)}
                </p>
                <p className="mt-1 text-[var(--gold-soft)]">
                  Covers {selected.durationMonths} month
                  {selected.durationMonths === 1 ? "" : "s"} of plan access
                </p>
              </div>

              <dl>
                <DetailRow label="Owner" value={selected.tenant.fullName} />
                <DetailRow label="Email" value={selected.tenant.email} />
                <DetailRow label="Branch" value={selected.branchName} />
                <DetailRow
                  label="Method"
                  value={paymentMethodLabel(selected.paymentMethod)}
                />
                <DetailRow label="Reference" value={selected.referenceNumber} />
                {selected.approvedByName && (
                  <DetailRow label="Reviewed by" value={selected.approvedByName} />
                )}
                {selected.status !== "PENDING" && (
                  <DetailRow
                    label="Updated"
                    value={formatAdminDateTime(selected.updatedAt)}
                  />
                )}
              </dl>

              {selected.rejectionReason && (
                <div className="rounded-2xl border border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.1)] px-4 py-3">
                  <p className="text-[11px] tracking-wide text-[var(--danger)] uppercase">
                    Decline reason
                  </p>
                  <p className="mt-1 text-white">{selected.rejectionReason}</p>
                </div>
              )}

              {selected.adminNotes && (
                <div className="rounded-2xl border border-[var(--line)] bg-black/20 px-4 py-3">
                  <p className="text-[11px] tracking-wide text-[var(--muted)] uppercase">
                    Admin notes
                  </p>
                  <p className="mt-1 text-white">{selected.adminNotes}</p>
                </div>
              )}

              <div>
                <p className="mb-2 text-[11px] tracking-wide text-[var(--muted)] uppercase">
                  Payment proof
                </p>
                <div className="overflow-hidden rounded-xl border border-[var(--line)]">
                  <AuthenticatedImage
                    apiPath={`/admin/payments/${selected.id}/proof`}
                    alt="Payment proof"
                    className="max-h-64 w-full bg-black/25 object-contain"
                  />
                </div>
              </div>

              {selected.status === "PENDING" && (
                <div className="space-y-3 border-t border-[var(--line)] pt-4">
                  <p className="text-[11px] tracking-[0.22em] text-[var(--muted)] uppercase">
                    Review actions
                  </p>
                  <label className="block">
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => approve.mutate(selected.id)}
                      className="rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--night)] disabled:opacity-50"
                    >
                      Confirm payment
                    </button>
                    <button
                      type="button"
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => reject.mutate(selected.id)}
                      className="rounded-full border border-white/15 px-4 py-2 text-sm text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {selected.status === "APPROVED" && (
                <p className="rounded-2xl border border-[rgba(61,186,138,0.3)] bg-[rgba(61,186,138,0.1)] px-4 py-3 text-[var(--success)]">
                  This payment was confirmed
                  {selected.approvedByName
                    ? ` by ${selected.approvedByName}`
                    : ""}
                  . The restaurant plan was extended accordingly.
                </p>
              )}

              {selected.status === "REJECTED" && (
                <p className="rounded-2xl border border-[rgba(255,107,107,0.3)] bg-[rgba(255,107,107,0.1)] px-4 py-3 text-[var(--danger)]">
                  This payment was declined. No plan changes were applied.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
