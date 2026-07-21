import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { BackButton } from "../../components/BackButton";
import { useAdminAuth } from "../../features/admin/AdminAuthContext";
import { api, type ApiSuccess } from "../../lib/api";

type BackupFile = {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      await queryClient.invalidateQueries({
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
        <BackButton fallbackTo="/admin" className="mb-3" />
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Admin console
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
          Settings
        </h1>
        <p className="mt-1 text-[var(--muted)]">
          Admin profile, environment, and database backups.
        </p>
      </div>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
          Signed-in admin
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
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
            <dd className="font-medium text-white">{admin?.role}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Access control
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">
          Role permissions
        </h2>
        <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
          <li>
            <span className="text-white">ADMIN</span> — approvals, payments,
            subscriptions, tenants (suspend/activate), announcements, activity
          </li>
          <li>
            <span className="text-white">SUPER_ADMIN</span> — everything above,
            plus plan edits, tenant delete, and ops jobs (backup / alerts /
            retention)
          </li>
        </ul>
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
                ? "Create and review recent database backups. Automatic backups run on a daily schedule."
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
                  {new Date(file.createdAt).toLocaleString()}
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
