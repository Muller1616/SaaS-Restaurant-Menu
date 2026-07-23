import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { api, type ApiSuccess } from "../../lib/api";
import { validateDeviceImage } from "../../lib/device-image";
import { formatEtb } from "../../lib/plans";
import {
  paymentMethodLabel,
  subscriptionEventLabel,
  subscriptionStatusLabel,
} from "../../lib/status-labels";

type RenewalOption = {
  months: number;
  label: string;
  amount: string;
};

type SubscriptionData = {
  branch: { id: string; name: string; location: string };
  plan: {
    name: string;
    slug: string;
    priceMonthly: string;
  };
  status: string;
  startDate: string;
  expiryDate: string | null;
  daysRemaining: number | null;
  canEdit: boolean;
  showRenew: boolean;
  isFree: boolean;
  canCancel: boolean;
  cancelledAt: string | null;
  retainUntil: string | null;
  retentionDaysLeft: number | null;
  retentionPurgedAt: string | null;
  renewalOptions: RenewalOption[];
};

const renewSchema = z.object({
  durationMonths: z.number(),
  paymentMethod: z.enum(["BANK_TRANSFER", "TELEBIRR", "CASH"]),
  referenceNumber: z.string().min(2, "Reference is required"),
  notes: z.string().optional(),
});

type RenewForm = z.infer<typeof renewSchema>;

type HistoryEvent = {
  id: string;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  summary: string;
  actorType: string | null;
  createdAt: string;
};

async function fetchSubscription() {
  const { data } = await api.get<ApiSuccess<SubscriptionData>>(
    "/tenant/subscription",
  );
  return data.data;
}

async function fetchHistory() {
  const { data } = await api.get<
    ApiSuccess<{ events: HistoryEvent[] }>
  >("/tenant/subscription/history");
  return data.data;
}

export function TenantSubscriptionPage() {
  const queryClient = useQueryClient();
  const { currentBranchId } = useTenantAuth();
  const [renewOpen, setRenewOpen] = useState(false);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const query = useQuery({
    queryKey: ["tenant", "subscription", currentBranchId],
    queryFn: fetchSubscription,
    enabled: Boolean(currentBranchId),
  });

  const history = useQuery({
    queryKey: ["tenant", "subscription-history", currentBranchId],
    queryFn: fetchHistory,
    enabled: Boolean(currentBranchId),
  });

  const form = useForm<RenewForm>({
    resolver: zodResolver(renewSchema),
    defaultValues: {
      durationMonths: 1,
      paymentMethod: "BANK_TRANSFER",
      referenceNumber: "",
      notes: "",
    },
  });

  const selectedMonths = form.watch("durationMonths");
  const selectedAmount = useMemo(() => {
    return (
      query.data?.renewalOptions.find((o) => o.months === selectedMonths)
        ?.amount ?? "0"
    );
  }, [query.data, selectedMonths]);

  const renewMutation = useMutation({
    mutationFn: async (values: RenewForm) => {
      if (!screenshot) throw new Error("Payment screenshot is required");
      const invalid = validateDeviceImage(screenshot);
      if (invalid) throw new Error(invalid);
      const body = new FormData();
      body.append("durationMonths", String(values.durationMonths));
      body.append("paymentMethod", values.paymentMethod);
      body.append("referenceNumber", values.referenceNumber);
      if (values.notes) body.append("notes", values.notes);
      body.append("screenshot", screenshot);
      const { data } = await api.post("/tenant/subscription/renew", body);
      return data.data;
    },
    onSuccess: async () => {
      setRenewOpen(false);
      setScreenshot(null);
      form.reset({
        durationMonths: 1,
        paymentMethod: "BANK_TRANSFER",
        referenceNumber: "",
        notes: "",
      });
      setNotice(
        "Payment submitted — we'll confirm it once an admin reviews the proof.",
      );
      void queryClient.invalidateQueries({ queryKey: ["tenant", "subscription"] });
      void queryClient.invalidateQueries({
        queryKey: ["tenant", "subscription-history"],
      });
      void queryClient.invalidateQueries({ queryKey: ["tenant", "payments"] });
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) ||
              "Couldn't submit renewal"
          : err instanceof Error
            ? err.message
            : "Couldn't submit renewal",
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiSuccess<SubscriptionData>>(
        "/tenant/subscription/cancel",
      );
      return data.data;
    },
    onSuccess: async () => {
      setNotice(
        "Plan cancelled. Your menu data stays available for 30 days, then is removed.",
      );
      void queryClient.invalidateQueries({ queryKey: ["tenant", "subscription"] });
      void queryClient.invalidateQueries({
        queryKey: ["tenant", "subscription-history"],
      });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) ||
              "Couldn't cancel subscription"
          : "Couldn't cancel subscription",
      ),
  });

  const status = query.data?.status ?? "—";
  const statusTone =
    status === "ACTIVE" || status === "TRIAL"
      ? "text-[var(--success)]"
      : status === "NEARLY_EXPIRED" || status === "GRACE_PERIOD"
        ? "text-[var(--gold-soft)]"
        : "text-[var(--danger)]";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Billing
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-4xl text-white">
          Subscription
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          See your branch plan at a glance. Renew before expiry to keep the
          public menu live; cancelled plans keep data for 30 days.
        </p>
      </div>

      {notice && (
        <div className="rounded-2xl bg-[rgba(61,186,138,0.12)] px-4 py-3 text-sm text-[var(--success)]">
          {notice}{" "}
          <Link to="/tenant/payments" className="underline">
            View payments
          </Link>
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {query.isLoading && <p className="text-[var(--muted)]">Loading…</p>}
      {query.data && (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6">
            <p className="text-sm text-[var(--muted)]">Current branch</p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-white">
              {query.data.branch.name}
            </h3>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <Stat label="Plan" value={query.data.plan.name} />
              <Stat
                label="Status"
                value={subscriptionStatusLabel(status)}
                className={statusTone}
              />
              <Stat
                label="Start date"
                value={new Date(query.data.startDate).toLocaleDateString()}
              />
              <Stat
                label="Expiry date"
                value={
                  query.data.expiryDate
                    ? new Date(query.data.expiryDate).toLocaleDateString()
                    : "No expiry"
                }
              />
              <Stat
                label="Days remaining"
                value={
                  query.data.daysRemaining == null
                    ? "—"
                    : String(query.data.daysRemaining)
                }
              />
              <Stat
                label="Monthly price"
                value={
                  query.data.isFree
                    ? "Free"
                    : formatEtb(query.data.plan.priceMonthly)
                }
              />
            </dl>
          </section>

          <section className="rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(160deg,rgba(212,165,116,0.14),rgba(18,26,23,0.95))] p-6">
            <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
              Renew subscription
            </h3>
            {query.data.isFree ? (
              <p className="mt-3 text-sm text-[var(--muted)]">
                You’re on the Free plan — no renewal payment is required.
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Choose a duration, upload payment proof, and an admin will
                  extend your expiry after verification.
                </p>
                {(query.data.showRenew || status === "CANCELLED") && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setRenewOpen(true);
                    }}
                    className="mt-6 rounded-full bg-[var(--gold)] px-6 py-3 text-sm font-bold text-[var(--night)]"
                  >
                    Renew subscription
                  </button>
                )}
              </>
            )}

            {query.data.status === "CANCELLED" && query.data.retainUntil && (
              <p className="mt-4 text-sm text-[var(--muted)]">
                Retention until{" "}
                {new Date(query.data.retainUntil).toLocaleDateString()}
                {query.data.retentionPurgedAt
                  ? " — menu data already purged."
                  : ` (${query.data.retentionDaysLeft ?? 0} day(s) left).`}
              </p>
            )}

            {query.data.canCancel && (
              <div className="mt-8 border-t border-white/10 pt-6">
                <h4 className="text-sm font-semibold text-white">Cancel plan</h4>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Public menu locks immediately. Categories and items are kept
                  for 30 days, then removed automatically.
                </p>
                <button
                  type="button"
                  disabled={cancelMutation.isPending}
                  onClick={() => setConfirmCancel(true)}
                  className="mt-4 rounded-full border border-[var(--danger)]/50 px-5 py-2.5 text-sm text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-50"
                >
                  {cancelMutation.isPending ? "Cancelling…" : "Cancel subscription"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {history.data && (
        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6">
          <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
            Subscription history
          </h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Timeline of renewals, status changes, and cancellations for this
            branch.
          </p>
          <ul className="mt-5 space-y-3">
            {history.data.events.map((event) => (
              <li
                key={event.id}
                className="rounded-2xl border border-[var(--line)] bg-black/20 px-4 py-3 text-sm"
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
              </li>
            ))}
          </ul>
          {history.data.events.length === 0 && (
            <p className="mt-4 text-sm text-[var(--muted)]">
              No history yet. Events appear when you renew, cancel, or an admin
              updates this subscription.
            </p>
          )}
        </section>
      )}

      {renewOpen && query.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.75rem] border border-[var(--line)] bg-[#121a17] p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
                Renew {query.data.branch.name}
              </h3>
              <button
                type="button"
                onClick={() => setRenewOpen(false)}
                className="rounded-full border border-white/15 px-3 py-1 text-sm"
              >
                Close
              </button>
            </div>

            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((values) => renewMutation.mutate(values))}
            >
              <fieldset>
                <legend className="mb-2 text-sm text-white">Duration</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {query.data.renewalOptions.map((option) => (
                    <label
                      key={option.months}
                      className={[
                        "cursor-pointer rounded-2xl border px-3 py-3 text-sm",
                        selectedMonths === option.months
                          ? "border-[var(--gold)] bg-[rgba(212,165,116,0.1)]"
                          : "border-[var(--line)]",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        value={option.months}
                        checked={selectedMonths === option.months}
                        onChange={() =>
                          form.setValue("durationMonths", option.months)
                        }
                      />
                      <span className="block font-semibold text-white">
                        {option.label}
                      </span>
                      <span className="text-[var(--gold-soft)]">
                        {formatEtb(option.amount)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <p className="text-sm text-[var(--muted)]">
                Amount due:{" "}
                <span className="font-semibold text-[var(--gold-soft)]">
                  {formatEtb(selectedAmount)}
                </span>
              </p>

              <label className="block text-sm">
                <span className="mb-1.5 block text-white">Payment method</span>
                <select
                  className="field"
                  {...form.register("paymentMethod")}
                >
                  <option value="BANK_TRANSFER">
                    {paymentMethodLabel("BANK_TRANSFER")}
                  </option>
                  <option value="TELEBIRR">
                    {paymentMethodLabel("TELEBIRR")}
                  </option>
                  <option value="CASH">{paymentMethodLabel("CASH")}</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block text-white">Reference number</span>
                <input className="field" {...form.register("referenceNumber")} />
                {form.formState.errors.referenceNumber && (
                  <span className="mt-1 block text-[var(--danger)]">
                    {form.formState.errors.referenceNumber.message}
                  </span>
                )}
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block text-white">
                  Screenshot from device (max 2MB)
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--gold)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--night)]"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file) {
                      const invalid = validateDeviceImage(file);
                      if (invalid) {
                        setScreenshot(null);
                        e.target.value = "";
                        setError(invalid);
                        return;
                      }
                    }
                    setScreenshot(file);
                  }}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block text-white">Notes (optional)</span>
                <textarea className="field min-h-20" {...form.register("notes")} />
              </label>

              <button
                type="submit"
                disabled={renewMutation.isPending}
                className="w-full rounded-full bg-[var(--gold)] px-5 py-3 text-sm font-bold text-[var(--night)] disabled:opacity-50"
              >
                {renewMutation.isPending ? "Submitting…" : "Submit payment"}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel subscription"
        message={
          query.data
            ? `Cancel subscription for ${query.data.branch.name}? Data is retained for 30 days.`
            : "Cancel this subscription?"
        }
        confirmLabel="Cancel plan"
        danger
        busy={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setError(null);
          setConfirmCancel(false);
          cancelMutation.mutate();
        }}
      />

      <style>{`
        .field {
          width: 100%;
          border-radius: 0.9rem;
          border: 1px solid var(--line);
          background: rgba(0,0,0,0.28);
          color: white;
          padding: 0.7rem 0.9rem;
          outline: none;
        }
        .field:focus { border-color: var(--gold); }
      `}</style>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold text-white ${className ?? ""}`}>
        {value}
      </dd>
    </div>
  );
}
