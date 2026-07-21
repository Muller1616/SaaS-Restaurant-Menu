import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { api, type ApiSuccess } from "../../lib/api";
import { formatEtb } from "../../lib/plans";
import { BackButton } from "../../components/BackButton";

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
};

async function fetchPayments() {
  const { data } = await api.get<ApiSuccess<PaymentRow[]>>("/tenant/payments");
  return data.data;
}

export function TenantPaymentsPage() {
  const { currentBranchId } = useTenantAuth();
  const query = useQuery({
    queryKey: ["tenant", "payments", currentBranchId],
    queryFn: fetchPayments,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <BackButton fallbackTo="/tenant" className="mb-3" />
          <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
            Ledger
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-4xl text-white">
            Payments
          </h2>
          <p className="mt-2 text-[var(--muted)]">
            Track renewal submissions for the selected branch.
          </p>
        </div>
        <Link
          to="/tenant/subscription"
          className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)]"
        >
          Renew / pay
        </Link>
      </div>

      {query.isLoading && <p className="text-[var(--muted)]">Loading payments…</p>}
      {query.data && query.data.length === 0 && (
        <div className="rounded-[1.75rem] border border-dashed border-white/15 px-6 py-14 text-center text-[var(--muted)]">
          No payments yet for this branch.
        </div>
      )}

      {query.data && query.data.length > 0 && (
        <div className="overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/25 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Proof</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((payment) => (
                <tr key={payment.id} className="border-t border-white/5">
                  <td className="px-4 py-3 text-white/85">
                    {new Date(payment.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{payment.branchName ?? "—"}</td>
                  <td className="px-4 py-3 text-[var(--gold-soft)]">
                    {formatEtb(payment.amount)}
                    <span className="block text-xs text-[var(--muted)]">
                      {payment.durationMonths} mo
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {payment.paymentMethod}
                    <span className="block text-xs text-[var(--muted)]">
                      {payment.referenceNumber}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Status status={payment.status} />
                    {payment.rejectionReason && (
                      <p className="mt-1 text-xs text-[var(--danger)]">
                        {payment.rejectionReason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={payment.screenshotUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--gold-soft)] underline"
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Status({ status }: { status: string }) {
  const tone =
    status === "APPROVED"
      ? "bg-[rgba(61,186,138,0.15)] text-[var(--success)]"
      : status === "REJECTED"
        ? "bg-[rgba(255,107,107,0.12)] text-[var(--danger)]"
        : "bg-[rgba(212,165,116,0.15)] text-[var(--gold-soft)]";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  );
}
