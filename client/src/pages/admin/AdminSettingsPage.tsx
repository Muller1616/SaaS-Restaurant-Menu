import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useAdminAuth } from "../../features/admin/AdminAuthContext";
import { api, type ApiSuccess } from "../../lib/api";
import { formatAdminDateTime } from "../../lib/datetime";

type BackupFile = {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

type AccessLevel = "full" | "view" | "none" | "super";

type PermissionItem = {
  label: string;
  description: string;
  admin: AccessLevel;
  superAdmin: AccessLevel;
};

type PermissionGroup = {
  id: string;
  title: string;
  summary: string;
  items: PermissionItem[];
};

/**
 * Mirrors the real platform RBAC: AdminRole is SUPER_ADMIN | ADMIN.
 * Capabilities match requireAdmin / requireSuperAdmin route gates.
 */
const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "tenants",
    title: "Tenant management",
    summary: "Restaurant registrations, account status, and directory.",
    items: [
      {
        label: "Review registrations",
        description: "Approve or decline pending restaurant applications.",
        admin: "full",
        superAdmin: "full",
      },
      {
        label: "Suspend / activate restaurants",
        description: "Change tenant account status without deleting data.",
        admin: "full",
        superAdmin: "full",
      },
      {
        label: "Edit restaurant slug",
        description: "Change the public tenant slug used in portal URLs.",
        admin: "none",
        superAdmin: "super",
      },
      {
        label: "Delete restaurant",
        description: "Permanently remove a tenant and related records.",
        admin: "none",
        superAdmin: "super",
      },
    ],
  },
  {
    id: "subscriptions",
    title: "Subscription management",
    summary: "Branch plans, renewals, suspensions, and lifecycle actions.",
    items: [
      {
        label: "View subscriptions",
        description: "Browse live plans, expiry, and renewal history.",
        admin: "full",
        superAdmin: "full",
      },
      {
        label: "Extend / suspend / cancel",
        description: "Apply billing actions to a branch subscription.",
        admin: "full",
        superAdmin: "full",
      },
    ],
  },
  {
    id: "payments",
    title: "Payment management",
    summary: "Payment proof review and renewal confirmations.",
    items: [
      {
        label: "Review payments",
        description: "Confirm or decline pending payment submissions.",
        admin: "full",
        superAdmin: "full",
      },
      {
        label: "Export payment CSV",
        description: "Download payment records for reconciliation.",
        admin: "full",
        superAdmin: "full",
      },
    ],
  },
  {
    id: "plans",
    title: "Plans & pricing",
    summary: "Public plan catalog used during registration and renewals.",
    items: [
      {
        label: "View plans",
        description: "See plan names, prices, and limits.",
        admin: "view",
        superAdmin: "full",
      },
      {
        label: "Edit plans",
        description: "Change pricing, limits, and plan availability.",
        admin: "none",
        superAdmin: "super",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports & analytics",
    summary: "Platform dashboard metrics and operational visibility.",
    items: [
      {
        label: "Dashboard statistics",
        description: "Tenant, subscription, payment, and menu view KPIs.",
        admin: "full",
        superAdmin: "full",
      },
      {
        label: "Branch directory",
        description: "Browse restaurants and branches across the platform.",
        admin: "full",
        superAdmin: "full",
      },
    ],
  },
  {
    id: "communications",
    title: "Communications",
    summary: "Outbound announcements to restaurant owners.",
    items: [
      {
        label: "Send announcements",
        description: "Notify all active tenants or a selected set.",
        admin: "full",
        superAdmin: "full",
      },
    ],
  },
  {
    id: "security",
    title: "Security & system",
    summary: "Sensitive operations reserved for platform owners.",
    items: [
      {
        label: "Run subscription alert job",
        description: "Trigger near-expiry / expired notification processing.",
        admin: "none",
        superAdmin: "super",
      },
      {
        label: "Run retention purge",
        description: "Purge cancelled subscription menu data after retention.",
        admin: "none",
        superAdmin: "super",
      },
      {
        label: "Database backups",
        description: "List and create database backups.",
        admin: "none",
        superAdmin: "super",
      },
    ],
  },
  {
    id: "audit",
    title: "Audit logs",
    summary: "Immutable activity trail for admins and restaurants.",
    items: [
      {
        label: "View activity log",
        description: "Inspect who did what across the platform.",
        admin: "full",
        superAdmin: "full",
      },
    ],
  },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AccessBadge({ level }: { level: AccessLevel }) {
  if (level === "full") {
    return (
      <span className="rounded-full border border-[rgba(61,186,138,0.35)] bg-[rgba(61,186,138,0.12)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--success)]">
        Allowed
      </span>
    );
  }
  if (level === "view") {
    return (
      <span className="rounded-full border border-[rgba(212,165,116,0.4)] bg-[rgba(212,165,116,0.12)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--gold-soft)]">
        View only
      </span>
    );
  }
  if (level === "super") {
    return (
      <span className="rounded-full border border-[rgba(212,165,116,0.4)] bg-[rgba(212,165,116,0.12)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--gold-soft)]">
        Super admin
      </span>
    );
  }
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
      Restricted
    </span>
  );
}

async function fetchBackups() {
  const { data } = await api.get<ApiSuccess<BackupFile[]>>(
    "/admin/jobs/database-backups",
  );
  return data.data;
}

export function AdminSettingsPage() {
  const { admin } = useAdminAuth();
  const isSuperAdmin = admin?.role === "SUPER_ADMIN";
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>("tenants");

  const backups = useQuery({
    queryKey: ["admin", "database-backups"],
    queryFn: fetchBackups,
    enabled: isSuperAdmin,
  });

  const runBackup = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<
        ApiSuccess<{
          fileName: string;
          sizeBytes: number;
          method: string;
          pruned: number;
        }>
      >("/admin/jobs/database-backup");
      return data.data;
    },
    onSuccess: async (result) => {
      setNotice(
        `Backup created: ${result.fileName} (${formatBytes(result.sizeBytes)}) via ${result.method}`,
      );
      setError(null);
      void queryClient.invalidateQueries({
        queryKey: ["admin", "database-backups"],
      });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Backup failed"
          : "Backup failed",
      ),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Admin console
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
          Settings
        </h1>
        <p className="mt-1 text-[var(--muted)]">
          Your admin profile, role-based access, and database backups.
        </p>
      </div>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
          Signed-in admin
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[var(--muted)]">Name</dt>
            <dd className="font-medium text-white">{admin?.name}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Email</dt>
            <dd className="font-medium text-white">{admin?.email}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Role</dt>
            <dd className="mt-1">
              <span
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  isSuperAdmin
                    ? "border-[rgba(212,165,116,0.4)] bg-[rgba(212,165,116,0.12)] text-[var(--gold-soft)]"
                    : "border-white/15 bg-white/5 text-white",
                ].join(" ")}
              >
                {isSuperAdmin ? "Super admin" : "Admin"}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
              Access control
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">
              Role permissions
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
              KitchenOS uses two platform roles enforced by the API. Capabilities
              below match live route guards — they are not editable placeholders.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/15 px-3 py-1 text-[var(--muted)]">
              Your access:{" "}
              <span className="text-white">
                {isSuperAdmin ? "Super admin" : "Admin"}
              </span>
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-2">
            {PERMISSION_GROUPS.map((group) => {
              const open = expandedGroup === group.id;
              const allowedForYou = group.items.filter((item) =>
                isSuperAdmin
                  ? item.superAdmin !== "none"
                  : item.admin !== "none",
              ).length;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() =>
                    setExpandedGroup(open ? null : group.id)
                  }
                  className={[
                    "w-full rounded-2xl border px-4 py-3 text-left transition",
                    open
                      ? "border-[var(--gold)]/50 bg-[rgba(212,165,116,0.1)]"
                      : "border-[var(--line)] bg-black/20 hover:border-white/25",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{group.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {group.summary}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--gold-soft)]">
                      {allowedForYou}/{group.items.length}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-black/20 p-4">
            {PERMISSION_GROUPS.filter((g) => g.id === expandedGroup).map(
              (group) => (
                <div key={group.id}>
                  <p className="text-[11px] tracking-[0.22em] text-[var(--gold)] uppercase">
                    {group.title}
                  </p>
                  <ul className="mt-4 space-y-3">
                    {group.items.map((item) => {
                      const yourLevel = isSuperAdmin
                        ? item.superAdmin
                        : item.admin;
                      return (
                        <li
                          key={item.label}
                          className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-white">
                                {item.label}
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                                {item.description}
                              </p>
                            </div>
                            <AccessBadge level={yourLevel} />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 border-t border-[var(--line)] pt-2 text-[11px] text-[var(--muted)]">
                            <span className="inline-flex items-center gap-1.5">
                              Admin <AccessBadge level={item.admin} />
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              Super admin{" "}
                              <AccessBadge
                                level={
                                  item.superAdmin === "super"
                                    ? "full"
                                    : item.superAdmin
                                }
                              />
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ),
            )}
            {!expandedGroup && (
              <p className="py-10 text-center text-sm text-[var(--muted)]">
                Select a permission group to inspect access by role.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
              Operations
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
              Database backups
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {isSuperAdmin
                ? "Create and review recent database backups. Automatic backups run daily."
                : "Backup listing and manual runs are restricted to Super Admin."}
            </p>
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              disabled={runBackup.isPending}
              onClick={() => runBackup.mutate()}
              className="rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--night)] disabled:opacity-60"
            >
              {runBackup.isPending ? "Backing up…" : "Run backup now"}
            </button>
          )}
        </div>

        {notice && (
          <div className="mt-4 rounded-2xl bg-[rgba(61,186,138,0.12)] px-4 py-3 text-sm text-[var(--success)]">
            {notice}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {isSuperAdmin && (
          <ul className="mt-5 divide-y divide-[var(--line)] text-sm">
            {(backups.data ?? []).slice(0, 10).map((file) => (
              <li
                key={file.fileName}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <span className="font-medium text-white">{file.fileName}</span>
                <span className="text-[var(--muted)]">
                  {formatBytes(file.sizeBytes)} ·{" "}
                  {formatAdminDateTime(file.createdAt)}
                </span>
              </li>
            ))}
            {backups.data?.length === 0 && (
              <li className="py-6 text-[var(--muted)]">No backups yet.</li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
