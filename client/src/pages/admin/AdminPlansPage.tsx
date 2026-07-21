import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { useAdminAuth } from "../../features/admin/AdminAuthContext";
import { api, type ApiSuccess } from "../../lib/api";
import { formatEtb } from "../../lib/plans";

type Plan = {
  id: string;
  name: string;
  slug: string;
  priceMonthly: string;
  maxBranches: number;
  maxItems: number | null;
  features: {
    customQr?: boolean;
    analytics?: string;
    support?: string;
  };
  isActive: boolean;
};

async function fetchPlans() {
  const { data } = await api.get<ApiSuccess<Plan[]>>("/admin/plans");
  return data.data;
}

export function AdminPlansPage() {
  const { admin } = useAdminAuth();
  const isSuperAdmin = admin?.role === "SUPER_ADMIN";
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "plans"], queryFn: fetchPlans });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    priceMonthly: "0",
    maxBranches: "1",
    maxItems: "",
    isActive: true,
    customQr: false,
    analytics: "none",
    support: "email",
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editing = query.data?.find((p) => p.id === editingId) ?? null;

  useEffect(() => {
    if (!editing) return;
    setDraft({
      name: editing.name,
      priceMonthly: editing.priceMonthly,
      maxBranches: String(editing.maxBranches),
      maxItems: editing.maxItems == null ? "" : String(editing.maxItems),
      isActive: editing.isActive,
      customQr: Boolean(editing.features?.customQr),
      analytics: String(editing.features?.analytics ?? "none"),
      support: String(editing.features?.support ?? "email"),
    });
  }, [editing]);

  const save = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { data } = await api.patch(`/admin/plans/${editingId}`, {
        name: draft.name,
        priceMonthly: Number(draft.priceMonthly),
        maxBranches: Number(draft.maxBranches),
        maxItems: draft.maxItems.trim() === "" ? null : Number(draft.maxItems),
        isActive: draft.isActive,
        features: {
          customQr: draft.customQr,
          analytics: draft.analytics,
          support: draft.support,
        },
      });
      return data.data;
    },
    onSuccess: async () => {
      setNotice("Plan updated.");
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "plans"] });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
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
          Pricing tiers
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
          Plans
        </h1>
        <p className="mt-1 text-[var(--muted)]">
          {isSuperAdmin
            ? "Adjust prices, limits, and features used at registration."
            : "View plan limits and features. Editing requires Super Admin."}
        </p>
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {query.data?.map((plan) => (
          <article
            key={plan.id}
            className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <p className="text-xs tracking-[0.2em] text-[var(--gold)] uppercase">
              {plan.slug}
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-white">
              {plan.name}
            </h2>
            <p className="mt-2 text-2xl font-semibold text-[var(--gold-soft)]">
              {Number(plan.priceMonthly) === 0
                ? "Free"
                : `${formatEtb(plan.priceMonthly)}/mo`}
            </p>
            <ul className="mt-4 space-y-1 text-sm text-[var(--muted)]">
              <li>
                Branches:{" "}
                {plan.maxBranches < 0 ? "Unlimited" : plan.maxBranches}
              </li>
              <li>
                Items: {plan.maxItems == null ? "Unlimited" : plan.maxItems}
              </li>
              <li>Custom QR: {plan.features?.customQr ? "Yes" : "No"}</li>
              <li>Analytics: {String(plan.features?.analytics ?? "none")}</li>
              <li>Active: {plan.isActive ? "Yes" : "No"}</li>
            </ul>
            {isSuperAdmin ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setNotice(null);
                  setEditingId(plan.id);
                }}
                className="mt-5 rounded-full border border-white/15 px-4 py-2 text-sm hover:border-[var(--gold)]"
              >
                Edit
              </button>
            ) : (
              <p className="mt-5 text-xs text-[var(--muted)]">View only</p>
            )}
          </article>
        ))}
      </div>

      {isSuperAdmin && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-[1.75rem] border border-[var(--line)] bg-[#121a17] p-6">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
                Edit {editing.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-full border border-white/15 px-3 py-1 text-sm"
              >
                Close
              </button>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-white">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-white outline-none focus:border-[var(--gold)]"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-white">Price monthly (ETB)</span>
                <input
                  type="number"
                  min={0}
                  value={draft.priceMonthly}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, priceMonthly: e.target.value }))
                  }
                  className="w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-white outline-none focus:border-[var(--gold)]"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-white">
                  Max branches (-1 = unlimited)
                </span>
                <input
                  type="number"
                  value={draft.maxBranches}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, maxBranches: e.target.value }))
                  }
                  className="w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-white outline-none focus:border-[var(--gold)]"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-white">
                Max items (blank = unlimited)
              </span>
              <input
                type="number"
                min={1}
                value={draft.maxItems}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, maxItems: e.target.value }))
                }
                className="w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-white outline-none focus:border-[var(--gold)]"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-white">Analytics</span>
                <select
                  value={draft.analytics}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, analytics: e.target.value }))
                  }
                  className="w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-white outline-none focus:border-[var(--gold)]"
                >
                  <option value="none">none</option>
                  <option value="basic">basic</option>
                  <option value="full">full</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-white">Support</span>
                <select
                  value={draft.support}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, support: e.target.value }))
                  }
                  className="w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-white outline-none focus:border-[var(--gold)]"
                >
                  <option value="email">email</option>
                  <option value="priority">priority</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={draft.customQr}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, customQr: e.target.checked }))
                }
              />
              Custom QR feature flag
            </label>
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, isActive: e.target.checked }))
                }
              />
              Plan active for registration
            </label>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="w-full rounded-full bg-[var(--gold)] px-5 py-3 text-sm font-bold text-[var(--night)] disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save plan"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
