import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { StatusIndicator } from "../../components/charts/StatusIndicator";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { api, type ApiSuccess } from "../../lib/api";
import { subscriptionStatusLabel } from "../../lib/status-labels";

type BranchRow = {
  id: string;
  name: string;
  location: string;
  phone: string | null;
  slug: string;
  qrCodeUrl: string | null;
  isDefault: boolean;
  itemCount: number;
  subscription: {
    status: string;
    expiryDate: string | null;
    plan: { name: string };
  } | null;
  menuUrl?: string;
  requiresPayment?: boolean;
};

type BranchesResponse = {
  plan: {
    name: string;
    slug: string;
    maxBranches: number;
  };
  canAddBranch: boolean;
  branches: BranchRow[];
};

const branchSchema = z.object({
  name: z.string().min(2, "Branch name is required"),
  location: z.string().min(2, "Location is required"),
  phone: z.string().optional(),
});

type BranchForm = z.infer<typeof branchSchema>;

async function fetchBranches() {
  const { data } = await api.get<ApiSuccess<BranchesResponse>>("/tenant/branches");
  return data.data;
}

export function TenantBranchesPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { refreshTenant, setBranch, currentBranchId } = useTenantAuth();
  const query = useQuery({ queryKey: ["tenant", "branches"], queryFn: fetchBranches });

  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const form = useForm<BranchForm>({
    resolver: zodResolver(branchSchema),
    defaultValues: { name: "", location: "", phone: "" },
  });

  useEffect(() => {
    if (params.get("add") === "1" && query.data?.canAddBranch) {
      form.reset({ name: "", location: "", phone: "" });
      setMode("create");
      const next = new URLSearchParams(params);
      next.delete("add");
      setParams(next, { replace: true });
    }
  }, [params, query.data?.canAddBranch, form, setParams]);

  async function afterBranchChange() {
    await queryClient.invalidateQueries({ queryKey: ["tenant", "branches"] });
    await queryClient.invalidateQueries({ queryKey: ["tenant", "dashboard"] });
    await refreshTenant();
  }

  const createMutation = useMutation({
    mutationFn: async (values: BranchForm) => {
      const { data } = await api.post<ApiSuccess<BranchRow>>("/tenant/branches", values);
      return data.data;
    },
    onSuccess: async (branch) => {
      setMode(null);
      form.reset();
      setNotice(
        branch.requiresPayment
          ? `${branch.name} added. Activate its subscription/payment before the public menu goes live.`
          : `${branch.name} added successfully.`,
      );
      setBranch(branch.id);
      await afterBranchChange();
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Could not add branch"
          : "Could not add branch",
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: BranchForm }) => {
      const { data } = await api.patch<ApiSuccess<BranchRow>>(
        `/tenant/branches/${id}`,
        values,
      );
      return data.data;
    },
    onSuccess: async (branch) => {
      setMode(null);
      setEditing(null);
      form.reset();
      setNotice(`${branch.name} updated.`);
      await afterBranchChange();
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Could not update branch"
          : "Could not update branch",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/tenant/branches/${id}`);
      return id;
    },
    onSuccess: async (id) => {
      setNotice("Branch removed.");
      if (currentBranchId === id && query.data?.branches) {
        const next = query.data.branches.find((b) => b.id !== id);
        if (next) setBranch(next.id);
      }
      await afterBranchChange();
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Could not delete branch"
          : "Could not delete branch",
      );
    },
  });

  function openCreate() {
    setError(null);
    setEditing(null);
    form.reset({ name: "", location: "", phone: "" });
    setMode("create");
    if (params.get("add")) {
      params.delete("add");
      setParams(params, { replace: true });
    }
  }

  function openEdit(branch: BranchRow) {
    setError(null);
    setEditing(branch);
    form.reset({
      name: branch.name,
      location: branch.location,
      phone: branch.phone ?? "",
    });
    setMode("edit");
  }

  function onSubmit(values: BranchForm) {
    setError(null);
    if (mode === "edit" && editing) {
      updateMutation.mutate({ id: editing.id, values });
      return;
    }
    createMutation.mutate(values);
  }

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const maxBranches = query.data?.plan.maxBranches ?? 0;
  const limitLabel =
    maxBranches < 0 ? "Unlimited branches" : `${maxBranches} branch max`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
            Locations
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-4xl text-white">
            Branches
          </h2>
          <p className="mt-2 text-[var(--muted)]">
            Each location has its own menu, QR code, and plan. Your limit:{" "}
            <span className="text-[var(--gold-soft)]">{limitLabel}</span>
            {query.data ? ` · ${query.data.plan.name}` : ""}.
          </p>
        </div>
        <button
          type="button"
          disabled={!query.data?.canAddBranch || busy}
          onClick={openCreate}
          className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)] disabled:cursor-not-allowed disabled:opacity-40"
          title={
            query.data && !query.data.canAddBranch
              ? "Upgrade your plan to add more branches"
              : undefined
          }
        >
          + Add new branch
        </button>
      </div>

      {query.data && !query.data.canAddBranch && (
        <div className="rounded-2xl border border-[var(--gold)]/30 bg-[rgba(212,165,116,0.08)] px-4 py-3 text-sm text-[var(--gold-soft)]">
          You’ve reached your branch limit on the {query.data.plan.name} plan.
          Upgrade to Popular or Premium to add more locations.
        </div>
      )}

      {notice && (
        <div className="rounded-2xl border border-[var(--success)]/30 bg-[rgba(61,186,138,0.1)] px-4 py-3 text-sm text-[var(--success)]">
          {notice}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => setNotice(null)}
          >
            dismiss
          </button>
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {query.isLoading && <p className="text-[var(--muted)]">Loading branches…</p>}
      {query.isError && (
        <p className="text-[var(--danger)]">Failed to load branches.</p>
      )}

      {query.data && (
        <div className="overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/25 text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.data.branches.map((branch) => (
                <tr
                  key={branch.id}
                  className={[
                    "border-t border-white/5",
                    currentBranchId === branch.id ? "bg-[rgba(212,165,116,0.08)]" : "",
                  ].join(" ")}
                >
                  <td className="px-4 py-4">
                    <p className="font-semibold text-white">
                      {branch.name}
                      {branch.isDefault && (
                        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] tracking-wide text-[var(--gold-soft)] uppercase">
                          Default
                        </span>
                      )}
                    </p>
                    <p className="text-[var(--muted)]">{branch.phone || "No phone"}</p>
                  </td>
                  <td className="px-4 py-4 text-[var(--mist)]/85">{branch.location}</td>
                  <td className="px-4 py-4 text-white">{branch.itemCount}</td>
                  <td className="px-4 py-4">
                    <StatusPill status={branch.subscription?.status ?? "—"} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setBranch(branch.id)}
                        className="rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-[var(--gold)]"
                      >
                        Manage
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(branch)}
                        className="rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-[var(--gold)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={query.data.branches.length <= 1 || busy}
                        onClick={() =>
                          setConfirmDeleteId({ id: branch.id, name: branch.name })
                        }
                        className="rounded-full border border-[var(--danger)]/40 px-3 py-1.5 text-xs text-[var(--danger)] disabled:opacity-30"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-lg rounded-[1.75rem] border border-[var(--line)] bg-[#121a17] p-6 shadow-2xl">
            <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
              {mode === "create" ? "New location" : "Edit branch"}
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
              {mode === "create" ? "Add a branch" : `Edit ${editing?.name}`}
            </h3>

            <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <Field label="Branch name" error={form.formState.errors.name?.message}>
                <input
                  className="field"
                  {...form.register("name")}
                  placeholder="Branch name"
                />
              </Field>
              <Field label="Location / address" error={form.formState.errors.location?.message}>
                <input
                  className="field"
                  {...form.register("location")}
                  placeholder="Street address"
                />
              </Field>
              <Field label="Phone (optional)">
                <input
                  className="field"
                  {...form.register("phone")}
                  placeholder="Phone number"
                />
              </Field>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)] disabled:opacity-50"
                >
                  {busy ? "Saving…" : mode === "create" ? "Create branch" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode(null);
                    setEditing(null);
                  }}
                  className="rounded-full border border-white/15 px-5 py-2.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        title="Remove branch"
        message={
          confirmDeleteId
            ? `Remove branch “${confirmDeleteId.name}”? This hides it from your dashboard.`
            : ""
        }
        confirmLabel="Remove"
        danger
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) deleteMutation.mutate(confirmDeleteId.id);
          setConfirmDeleteId(null);
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
        .field:focus {
          border-color: var(--gold);
          box-shadow: 0 0 0 3px rgba(212,165,116,0.15);
        }
      `}</style>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const key = status === "—" ? "NO_SUBSCRIPTION" : status;
  return (
    <StatusIndicator status={key}>
      {status === "—"
        ? subscriptionStatusLabel("NO_SUBSCRIPTION")
        : subscriptionStatusLabel(status)}
    </StatusIndicator>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-white/90">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-[var(--danger)]">{error}</span>}
    </label>
  );
}
