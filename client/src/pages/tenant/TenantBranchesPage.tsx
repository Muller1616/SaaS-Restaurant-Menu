import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { StatusIndicator } from "../../components/charts/StatusIndicator";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { api, type ApiSuccess } from "../../lib/api";
import { subscriptionStatusLabel } from "../../lib/status-labels";
import { tenantPortalPath } from "../../lib/tenant-paths";

type BranchRow = {
  id: string;
  name: string;
  location: string;
  city: string | null;
  region: string | null;
  country: string | null;
  displayLocation: string;
  phone: string | null;
  managerName: string | null;
  slug: string;
  publicQrId: string;
  qrCodeUrl: string | null;
  menuUrl: string;
  isActive: boolean;
  isDefault: boolean;
  deletedAt: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  businessName?: string;
  subscription: {
    status: string;
    expiryDate: string | null;
    plan: { name: string };
  } | null;
  requiresPayment?: boolean;
};

type BranchesResponse = {
  plan: {
    name: string;
    slug: string;
    maxBranches: number;
  };
  businessName: string;
  canAddBranch: boolean;
  branches: BranchRow[];
};

const branchSchema = z.object({
  name: z.string().min(2, "Branch name is required"),
  location: z.string().min(2, "Address is required"),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  managerName: z.string().optional(),
});

type BranchForm = z.infer<typeof branchSchema>;

async function fetchBranches(includeDeleted: boolean) {
  const { data } = await api.get<ApiSuccess<BranchesResponse>>(
    "/tenant/branches",
    { params: includeDeleted ? { includeDeleted: "1" } : undefined },
  );
  return data.data;
}

function emptyForm(): BranchForm {
  return {
    name: "",
    location: "",
    city: "",
    region: "",
    country: "",
    phone: "",
    managerName: "",
  };
}

function formFromBranch(branch: BranchRow): BranchForm {
  return {
    name: branch.name,
    location: branch.location,
    city: branch.city ?? "",
    region: branch.region ?? "",
    country: branch.country ?? "",
    phone: branch.phone ?? "",
    managerName: branch.managerName ?? "",
  };
}

export function TenantBranchesPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { tenant, refreshTenant, setBranch, currentBranchId } = useTenantAuth();
  const slug = tenant?.slug ?? "";
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const query = useQuery({
    queryKey: ["tenant", "branches", includeDeleted],
    queryFn: () => fetchBranches(includeDeleted),
  });

  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [manageBranch, setManageBranch] = useState<BranchRow | null>(null);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const form = useForm<BranchForm>({
    resolver: zodResolver(branchSchema),
    defaultValues: emptyForm(),
  });

  useEffect(() => {
    if (params.get("add") === "1" && query.data?.canAddBranch) {
      form.reset(emptyForm());
      setMode("create");
      const next = new URLSearchParams(params);
      next.delete("add");
      setParams(next, { replace: true });
    }
  }, [params, query.data?.canAddBranch, form, setParams]);

  async function afterBranchChange() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tenant", "branches"] }),
      queryClient.invalidateQueries({ queryKey: ["tenant", "dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["tenant", "qr"] }),
      queryClient.invalidateQueries({ queryKey: ["tenant", "menu"] }),
      queryClient.invalidateQueries({ queryKey: ["tenant", "analytics"] }),
      queryClient.invalidateQueries({ queryKey: ["tenant", "subscription"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "branches"] }),
    ]);
    await refreshTenant();
  }

  const createMutation = useMutation({
    mutationFn: async (values: BranchForm) => {
      const { data } = await api.post<ApiSuccess<BranchRow>>(
        "/tenant/branches",
        values,
      );
      return data.data;
    },
    onSuccess: async (branch) => {
      setMode(null);
      form.reset(emptyForm());
      setNotice(
        branch.requiresPayment
          ? `${branch.name} added. Activate its subscription before the public menu goes live.`
          : `${branch.name} added successfully.`,
      );
      setBranch(branch.id);
      setManageBranch(branch);
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
      form.reset(emptyForm());
      setNotice(`${branch.name} updated across your portal and public menu.`);
      setManageBranch(branch);
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

  const statusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data } = await api.patch<ApiSuccess<BranchRow>>(
        `/tenant/branches/${id}/status`,
        { isActive },
      );
      return data.data;
    },
    onSuccess: async (branch) => {
      setNotice(
        branch.isActive
          ? `${branch.name} is active on the public menu.`
          : `${branch.name} is deactivated — public QR menu is hidden.`,
      );
      setManageBranch(branch);
      await afterBranchChange();
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Could not update status"
          : "Could not update status",
      );
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<ApiSuccess<BranchRow>>(
        `/tenant/branches/${id}/restore`,
      );
      return data.data;
    },
    onSuccess: async (branch) => {
      setNotice(`${branch.name} restored with a new QR code.`);
      setBranch(branch.id);
      setManageBranch(branch);
      await afterBranchChange();
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Could not restore branch"
          : "Could not restore branch",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/tenant/branches/${id}`);
      return id;
    },
    onSuccess: async (id) => {
      setNotice("Branch removed. Associated QR codes were invalidated.");
      setManageBranch(null);
      if (currentBranchId === id && query.data?.branches) {
        const next = query.data.branches.find(
          (b) => b.id !== id && !b.deletedAt,
        );
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
    form.reset(emptyForm());
    setMode("create");
  }

  function openEdit(branch: BranchRow) {
    setError(null);
    setEditing(branch);
    form.reset(formFromBranch(branch));
    setMode("edit");
  }

  function openManage(branch: BranchRow) {
    setError(null);
    if (!branch.deletedAt) {
      setBranch(branch.id);
    }
    setManageBranch(branch);
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
    deleteMutation.isPending ||
    statusMutation.isPending ||
    restoreMutation.isPending;

  const maxBranches = query.data?.plan.maxBranches ?? 0;
  const limitLabel =
    maxBranches < 0 ? "Unlimited branches" : `${maxBranches} branch max`;
  const liveBranches =
    query.data?.branches.filter((b) => !b.deletedAt) ?? [];
  const deletedBranches =
    query.data?.branches.filter((b) => b.deletedAt) ?? [];

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
            {query.data?.businessName
              ? `${query.data.businessName} · `
              : ""}
            Each location has its own menu, QR code, and plan. Limit:{" "}
            <span className="text-[var(--gold-soft)]">{limitLabel}</span>
            {query.data ? ` · ${query.data.plan.name}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
            />
            Show deleted
          </label>
          <button
            type="button"
            disabled={!query.data?.canAddBranch || busy}
            onClick={openCreate}
            className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add new branch
          </button>
        </div>
      </div>

      {query.data && !query.data.canAddBranch && (
        <div className="rounded-2xl border border-[var(--gold)]/30 bg-[rgba(212,165,116,0.08)] px-4 py-3 text-sm text-[var(--gold-soft)]">
          You’ve reached your branch limit on the {query.data.plan.name} plan.
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
              {[...liveBranches, ...deletedBranches].map((branch) => (
                <tr
                  key={branch.id}
                  className={[
                    "border-t border-white/5",
                    currentBranchId === branch.id
                      ? "bg-[rgba(212,165,116,0.08)]"
                      : "",
                    branch.deletedAt ? "opacity-60" : "",
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
                      {!branch.isActive && !branch.deletedAt && (
                        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] tracking-wide text-[var(--muted)] uppercase">
                          Inactive
                        </span>
                      )}
                      {branch.deletedAt && (
                        <span className="ml-2 rounded-full bg-[rgba(255,107,107,0.15)] px-2 py-0.5 text-[10px] tracking-wide text-[var(--danger)] uppercase">
                          Deleted
                        </span>
                      )}
                    </p>
                    <p className="text-[var(--muted)]">
                      {branch.phone || "No phone"}
                      {branch.managerName ? ` · ${branch.managerName}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-[var(--mist)]/85">
                    {branch.displayLocation || branch.location}
                  </td>
                  <td className="px-4 py-4 text-white">{branch.itemCount}</td>
                  <td className="px-4 py-4">
                    <StatusPill status={branch.subscription?.status ?? "—"} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openManage(branch)}
                        className="rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-[var(--gold)]"
                      >
                        Manage
                      </button>
                      {!branch.deletedAt && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(branch)}
                            className="rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-[var(--gold)]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={liveBranches.length <= 1 || busy}
                            onClick={() =>
                              setConfirmDeleteId({
                                id: branch.id,
                                name: branch.name,
                              })
                            }
                            className="rounded-full border border-[var(--danger)]/40 px-3 py-1.5 text-xs text-[var(--danger)] disabled:opacity-30"
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {branch.deletedAt && (
                        <button
                          type="button"
                          disabled={busy || !query.data.canAddBranch}
                          onClick={() => restoreMutation.mutate(branch.id)}
                          className="rounded-full border border-[var(--success)]/40 px-3 py-1.5 text-xs text-[var(--success)] disabled:opacity-30"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {manageBranch && (
        <ManagePanel
          branch={manageBranch}
          businessName={query.data?.businessName ?? tenant?.businessName ?? ""}
          slug={slug}
          busy={busy}
          onClose={() => setManageBranch(null)}
          onEdit={() => {
            openEdit(manageBranch);
            setManageBranch(null);
          }}
          onToggleActive={() =>
            statusMutation.mutate({
              id: manageBranch.id,
              isActive: !manageBranch.isActive,
            })
          }
          onRestore={() => restoreMutation.mutate(manageBranch.id)}
          onDelete={() =>
            setConfirmDeleteId({
              id: manageBranch.id,
              name: manageBranch.name,
            })
          }
          canDelete={liveBranches.length > 1}
          canRestore={Boolean(query.data?.canAddBranch)}
        />
      )}

      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.75rem] border border-[var(--line)] bg-[#121a17] p-6 shadow-2xl">
            <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
              {mode === "create" ? "New location" : "Edit branch"}
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
              {mode === "create" ? "Add a branch" : `Edit ${editing?.name}`}
            </h3>

            <form
              className="mt-6 space-y-4"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <Field label="Branch name" error={form.formState.errors.name?.message}>
                <input className="field" {...form.register("name")} />
              </Field>
              <Field
                label="Street address"
                error={form.formState.errors.location?.message}
              >
                <input className="field" {...form.register("location")} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="City">
                  <input className="field" {...form.register("city")} />
                </Field>
                <Field label="Region / state">
                  <input className="field" {...form.register("region")} />
                </Field>
              </div>
              <Field label="Country">
                <input className="field" {...form.register("country")} />
              </Field>
              <Field label="Phone">
                <input className="field" {...form.register("phone")} />
              </Field>
              <Field label="Branch manager">
                <input className="field" {...form.register("managerName")} />
              </Field>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)] disabled:opacity-50"
                >
                  {busy
                    ? "Saving…"
                    : mode === "create"
                      ? "Create branch"
                      : "Save changes"}
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
            ? `Remove “${confirmDeleteId.name}”? The public QR will stop working. You can restore later if your plan allows.`
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

function ManagePanel({
  branch,
  businessName,
  slug,
  busy,
  onClose,
  onEdit,
  onToggleActive,
  onRestore,
  onDelete,
  canDelete,
  canRestore,
}: {
  branch: BranchRow;
  businessName: string;
  slug: string;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  canDelete: boolean;
  canRestore: boolean;
}) {
  const deleted = Boolean(branch.deletedAt);
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/55">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[var(--line)] bg-[#121a17] p-6 shadow-2xl">
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Branch workspace
        </p>
        <h3 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
          {branch.name}
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {businessName || "Restaurant"} · working branch for Menu, QR, and
          Analytics
        </p>

        <dl className="mt-6 space-y-3 text-sm">
          <Detail label="Restaurant" value={businessName || "—"} />
          <Detail
            label="Address"
            value={branch.displayLocation || branch.location}
          />
          <Detail label="Phone" value={branch.phone || "—"} />
          <Detail label="Manager" value={branch.managerName || "—"} />
          <Detail
            label="Branch status"
            value={
              deleted
                ? "Deleted"
                : branch.isActive
                  ? "Active (public menu)"
                  : "Inactive (hidden from public)"
            }
          />
          <Detail
            label="Subscription"
            value={
              branch.subscription
                ? subscriptionStatusLabel(branch.subscription.status)
                : "None"
            }
          />
          <Detail label="Menu items" value={String(branch.itemCount)} />
          <Detail
            label="Updated"
            value={new Date(branch.updatedAt).toLocaleString()}
          />
        </dl>

        <div className="mt-6 flex flex-col gap-2">
          {!deleted && (
            <>
              <Link
                to={tenantPortalPath(slug, "menu")}
                className="rounded-full bg-[var(--gold)] px-4 py-2.5 text-center text-sm font-bold text-[var(--night)]"
                onClick={onClose}
              >
                Open menu editor
              </Link>
              <Link
                to={tenantPortalPath(slug, "qr")}
                className="rounded-full border border-white/15 px-4 py-2.5 text-center text-sm"
                onClick={onClose}
              >
                Manage QR code
              </Link>
              <Link
                to={tenantPortalPath(slug, "subscription")}
                className="rounded-full border border-white/15 px-4 py-2.5 text-center text-sm"
                onClick={onClose}
              >
                Subscription & billing
              </Link>
              <Link
                to={tenantPortalPath(slug, "analytics")}
                className="rounded-full border border-white/15 px-4 py-2.5 text-center text-sm"
                onClick={onClose}
              >
                Branch analytics
              </Link>
              {branch.menuUrl && (
                <a
                  href={branch.menuUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/15 px-4 py-2.5 text-center text-sm"
                >
                  Preview public menu
                </a>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={onEdit}
                className="rounded-full border border-white/15 px-4 py-2.5 text-sm"
              >
                Edit branch details
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onToggleActive}
                className="rounded-full border border-white/15 px-4 py-2.5 text-sm"
              >
                {branch.isActive ? "Deactivate branch" : "Activate branch"}
              </button>
              <button
                type="button"
                disabled={busy || !canDelete}
                onClick={onDelete}
                className="rounded-full border border-[var(--danger)]/40 px-4 py-2.5 text-sm text-[var(--danger)] disabled:opacity-30"
              >
                Delete branch
              </button>
            </>
          )}
          {deleted && (
            <button
              type="button"
              disabled={busy || !canRestore}
              onClick={onRestore}
              className="rounded-full bg-[var(--gold)] px-4 py-2.5 text-sm font-bold text-[var(--night)] disabled:opacity-40"
            >
              Restore branch
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-2 rounded-full border border-white/10 px-4 py-2.5 text-sm text-[var(--muted)]"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 pb-2">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right text-white">{value}</dd>
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
      {error && (
        <span className="mt-1 block text-sm text-[var(--danger)]">{error}</span>
      )}
    </label>
  );
}
