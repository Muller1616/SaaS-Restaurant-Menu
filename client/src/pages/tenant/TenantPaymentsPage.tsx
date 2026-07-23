import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { StatusIndicator } from "../../components/charts/StatusIndicator";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { tenantPortalPath } from "../../lib/tenant-paths";
import { api, type ApiSuccess } from "../../lib/api";
import { formatEtb } from "../../lib/plans";
import {
  paymentMethodLabel,
  paymentStatusLabel,
} from "../../lib/status-labels";

async function openPaymentProof(paymentId: string) {
  const { data } = await api.get(`/tenant/payments/${paymentId}/proof`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(data);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

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
  const { currentBranchId , tenant} = useTenantAuth();
  const portal = (...segments: string[]) => tenantPortalPath(tenant?.slug ?? "", ...segments);
  const query = useQuery({
    queryKey: ["tenant", "payments", currentBranchId],
    queryFn: fetchPayments,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
            Payments
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-4xl text-white">
            Payment history
          </h2>
          <p className="mt-2 text-[var(--muted)]">
            Track renewal submissions for the selected branch.
          </p>
        </div>
        <Link
          to={portal("subscription")}
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
                    {paymentMethodLabel(payment.paymentMethod)}
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
                    <button
                      type="button"
                      onClick={() => void openPaymentProof(payment.id)}
                      className="text-[var(--gold-soft)] underline"
                    >
                      View
                    </button>
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
  return (
    <StatusIndicator status={status}>
      {paymentStatusLabel(status)}
    </StatusIndicator>
  );
}
