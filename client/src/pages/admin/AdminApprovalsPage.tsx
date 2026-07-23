import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { api, type ApiSuccess } from "../../lib/api";
import { formatEtb } from "../../lib/plans";
import { paymentMethodLabel } from "../../lib/status-labels";

type PendingRegistration = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  businessLocation: string;
  businessDescription: string | null;
  registrationPaymentUrl: string | null;
  createdAt: string;
  plan: {
    name: string;
    slug: string;
    priceMonthly: string;
  };
  latestPayment: {
    id: string;
    amount: string;
    paymentMethod: string;
    referenceNumber: string;
    screenshotUrl: string;
    status: string;
  } | null;
};

type ApproveResult = {
  id: string;
  email: string;
  businessName: string;
  temporaryPassword: string;
  activationUrl: string;
  loginUrl: string;
  emailDelivered?: boolean;
  branch: {
    name: string;
    menuUrl: string;
    qrCodeUrl: string;
  };
};

async function fetchPending() {
  const { data } = await api.get<ApiSuccess<PendingRegistration[]>>(
    "/admin/registrations/pending",
  );
  return data.data;
}

export function AdminApprovalsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "registrations", "pending"],
    queryFn: fetchPending,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [approvedCreds, setApprovedCreds] = useState<ApproveResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selected = query.data?.find((item) => item.id === selectedId) ?? null;
  const selectedIds = useMemo(
    () => Object.entries(checked).filter(([, v]) => v).map(([id]) => id),
    [checked],
  );

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  }

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "registrations"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  }

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<ApiSuccess<ApproveResult>>(
        `/admin/registrations/${id}/approve`,
      );
      return data.data;
    },
    onSuccess: (data) => {
      setApprovedCreds(data);
      setSelectedId(null);
      setChecked((prev) => {
        const next = { ...prev };
        delete next[data.id];
        return next;
      });
      invalidateAll();
      showToast(`${data.businessName} approved`);
    },
    onError: (error) => {
      setActionError(
        axios.isAxiosError(error)
          ? (error.response?.data?.message as string) ||
              "Couldn't approve registration"
          : "Couldn't approve registration",
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { data } = await api.post(`/admin/registrations/${id}/reject`, {
        reason,
      });
      return data.data as { businessName: string; id: string };
    },
    onSuccess: (data) => {
      setRejectOpen(false);
      setRejectReason("");
      setSelectedId(null);
      invalidateAll();
      showToast(`${data.businessName} declined`);
    },
    onError: (error) => {
      setActionError(
        axios.isAxiosError(error)
          ? (error.response?.data?.message as string) ||
              "Couldn't decline registration"
          : "Couldn't decline registration",
      );
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data } = await api.post<ApiSuccess<ApproveResult[]>>(
        "/admin/registrations/bulk-approve",
        { ids },
      );
      return data.data;
    },
    onSuccess: (data) => {
      setChecked({});
      setSelectedId(null);
      invalidateAll();
      showToast(
        data.length === 1
          ? "1 registration approved"
          : `${data.length} registrations approved`,
      );
      if (data[0]) setApprovedCreds(data[0]);
    },
    onError: (error) => {
      setActionError(
        axios.isAxiosError(error)
          ? (error.response?.data?.message as string) ||
              "Couldn't approve selected registrations"
          : "Couldn't approve selected registrations",
      );
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason?: string }) => {
      const { data } = await api.post("/admin/registrations/bulk-reject", {
        ids,
        reason,
      });
      return data.data as unknown[];
    },
    onSuccess: (data) => {
      setBulkRejectOpen(false);
      setBulkRejectReason("");
      setChecked({});
      setSelectedId(null);
      invalidateAll();
      showToast(
        data.length === 1
          ? "1 registration declined"
          : `${data.length} registrations declined`,
      );
    },
    onError: (error) => {
      setActionError(
        axios.isAxiosError(error)
          ? (error.response?.data?.message as string) ||
              "Couldn't decline selected registrations"
          : "Couldn't decline selected registrations",
      );
    },
  });

  const busy =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    bulkApproveMutation.isPending ||
    bulkRejectMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
            Review queue
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-white">
            Applications
          </h1>
          <p className="mt-1 text-[var(--muted)]">
            Review new restaurant applications and approve or decline them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--gold)]/30 bg-[rgba(212,165,116,0.12)] px-3 py-1.5 text-sm font-semibold text-[var(--gold-soft)]">
            {query.data?.length ?? 0} awaiting review
          </span>
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => bulkApproveMutation.mutate(selectedIds)}
            className="rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--night)] disabled:opacity-40"
          >
            Approve selected
          </button>
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => setBulkRejectOpen(true)}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-40"
          >
            Decline selected
          </button>
        </div>
      </div>

      {toast && (
        <div className="rounded-2xl bg-[rgba(61,186,138,0.12)] px-4 py-3 text-sm text-[var(--success)]">
          {toast}
        </div>
      )}
      {actionError && (
        <div className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {actionError}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => setActionError(null)}
          >
            dismiss
          </button>
        </div>
      )}

      {query.isLoading && (
        <p className="text-[var(--muted)]">Loading registrations…</p>
      )}
      {query.isError && (
        <p className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          Couldn't load pending registrations.
        </p>
      )}

      {query.data && query.data.length === 0 && (
        <div className="rounded-[1.75rem] border border-dashed border-white/15 px-6 py-16 text-center">
          <p className="font-[family-name:var(--font-display)] text-3xl text-white">
            All clear
          </p>
          <p className="mt-2 text-[var(--muted)]">
            No registrations waiting for review.
          </p>
        </div>
      )}

      {query.data && query.data.length > 0 && (
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--panel-2)] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        query.data.length > 0 &&
                        query.data.every((item) => checked[item.id])
                      }
                      onChange={(e) => {
                        const next: Record<string, boolean> = {};
                        if (e.target.checked) {
                          query.data.forEach((item) => {
                            next[item.id] = true;
                          });
                        }
                        setChecked(next);
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      setActionError(null);
                    }}
                    className={[
                      "cursor-pointer border-t border-[var(--line)] transition hover:bg-white/4",
                      selectedId === item.id
                        ? "bg-[rgba(212,165,116,0.12)]"
                        : "",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={Boolean(checked[item.id])}
                        onChange={(e) =>
                          setChecked((prev) => ({
                            ...prev,
                            [item.id]: e.target.checked,
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">
                        {item.businessName}
                      </p>
                      <p className="text-[var(--muted)]">{item.businessLocation}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white">{item.fullName}</p>
                      <p className="text-[var(--muted)]">{item.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{item.plan.name}</p>
                      <p className="text-[var(--muted)]">
                        {formatEtb(item.plan.priceMonthly)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-white/85">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5">
            {!selected && (
              <div className="flex h-full min-h-64 items-center justify-center text-center text-[var(--muted)]">
                Select a registration to review payment proof and decide.
              </div>
            )}
            {selected && (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] tracking-[0.25em] text-[var(--gold)] uppercase">
                    Registration detail
                  </p>
                  <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-white">
                    {selected.businessName}
                  </h2>
                </div>
                <dl className="grid gap-3 text-sm">
                  <Row label="Owner" value={selected.fullName} />
                  <Row label="Email" value={selected.email} />
                  <Row label="Phone" value={selected.phone} />
                  <Row label="Location" value={selected.businessLocation} />
                  <Row label="Plan" value={selected.plan.name} />
                  {selected.businessDescription && (
                    <Row label="About" value={selected.businessDescription} />
                  )}
                  {selected.latestPayment && (
                    <>
                      <Row
                        label="Payment"
                        value={`${formatEtb(selected.latestPayment.amount)} · ${paymentMethodLabel(selected.latestPayment.paymentMethod)}`}
                      />
                      <Row
                        label="Reference"
                        value={selected.latestPayment.referenceNumber}
                      />
                    </>
                  )}
                </dl>

                {(selected.latestPayment?.screenshotUrl ||
                  selected.registrationPaymentUrl) && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-white">
                      Payment screenshot
                    </p>
                    <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
                      <AuthenticatedImage
                        apiPath={
                          selected.latestPayment
                            ? `/admin/payments/${selected.latestPayment.id}/proof`
                            : `/admin/registrations/${selected.id}/payment-proof`
                        }
                        alt="Payment proof"
                        className="max-h-64 w-full bg-black/25 object-contain"
                      />
                    </div>
                  </div>
                )}

                {!rejectOpen ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => approveMutation.mutate(selected.id)}
                      className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)] disabled:opacity-50"
                    >
                      {approveMutation.isPending ? "Approving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRejectOpen(true)}
                      className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-[var(--danger)]/30 bg-[rgba(255,107,107,0.08)] p-4">
                    <p className="text-sm font-medium text-[var(--danger)]">
                      Decline {selected.businessName}?
                    </p>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Optional reason sent to the applicant"
                      className="min-h-24 w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-[var(--danger)]"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          rejectMutation.mutate({
                            id: selected.id,
                            reason: rejectReason,
                          })
                        }
                        className="rounded-full border border-[var(--danger)] bg-[rgba(255,107,107,0.2)] px-4 py-2 text-sm font-semibold text-[var(--danger)] disabled:opacity-50"
                      >
                        {rejectMutation.isPending
                          ? "Declining…"
                          : "Confirm decline"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectOpen(false);
                          setRejectReason("");
                        }}
                        className="rounded-full border border-white/15 px-4 py-2 text-sm text-[var(--muted)] hover:border-[var(--gold)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {bulkRejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
            <h3 className="font-[family-name:var(--font-display)] text-2xl text-white">
              Decline {selectedIds.length} registration
              {selectedIds.length === 1 ? "" : "s"}?
            </h3>
            <textarea
              value={bulkRejectReason}
              onChange={(e) => setBulkRejectReason(e.target.value)}
              placeholder="Shared optional reason"
              className="mt-4 min-h-28 w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-[var(--danger)]"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  bulkRejectMutation.mutate({
                    ids: selectedIds,
                    reason: bulkRejectReason,
                  })
                }
                className="rounded-full border border-[var(--danger)] bg-[rgba(255,107,107,0.2)] px-4 py-2 text-sm font-semibold text-[var(--danger)]"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setBulkRejectOpen(false)}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-[var(--muted)] hover:border-[var(--gold)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {approvedCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
            <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
              Approved
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
              {approvedCreds.businessName} is live
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {approvedCreds.emailDelivered === false
                ? "Email could not be delivered (SMTP unavailable). Copy the activation link and temporary password and share them with the owner now — they are only shown once."
                : "An activation email was sent to the owner. Copy the link and temporary password now — they are only shown once here."}
            </p>
            <div className="mt-5 space-y-2 rounded-2xl border border-[var(--line)] bg-black/25 p-4 text-sm text-white">
              <p>
                <span className="text-[var(--muted)]">Email:</span> {approvedCreds.email}
              </p>
              <p>
                <span className="text-[var(--muted)]">Temporary password:</span>{" "}
                <span className="font-mono text-[var(--gold-soft)]">
                  {approvedCreds.temporaryPassword}
                </span>
              </p>
              <p className="break-all">
                <span className="text-[var(--muted)]">Activation link:</span>{" "}
                <a
                  href={approvedCreds.activationUrl}
                  className="text-[var(--gold-soft)] underline"
                >
                  {approvedCreds.activationUrl}
                </a>
              </p>
              <p>
                <span className="text-[var(--muted)]">Branch:</span>{" "}
                {approvedCreds.branch.name}
              </p>
              <p className="break-all">
                <span className="text-[var(--muted)]">Menu URL:</span>{" "}
                {approvedCreds.branch.menuUrl}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={approvedCreds.activationUrl}
                className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)]"
              >
                Open activation link
              </a>
              <a
                href={approvedCreds.loginUrl}
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm hover:border-[var(--gold)]"
              >
                Restaurant login
              </a>
              <button
                type="button"
                onClick={() => setApprovedCreds(null)}
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm hover:border-[var(--gold)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-medium text-white">{value}</dd>
    </div>
  );
}
