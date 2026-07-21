import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { api, type ApiSuccess } from "../../lib/api";

type TenantOption = {
  id: string;
  businessName: string;
  email: string;
};

type PageResult<T> = {
  items: T[];
  total: number;
};

export function AdminNotificationsPage() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<"ALL_ACTIVE" | "SELECTED">(
    "ALL_ACTIVE",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tenants = useQuery({
    queryKey: ["admin", "tenants", "ACTIVE", "all"],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<PageResult<TenantOption>>>(
        "/admin/tenants",
        { params: { status: "ACTIVE", all: "1" } },
      );
      return data.data.items;
    },
  });

  const recipientCount = useMemo(() => {
    if (audience === "ALL_ACTIVE") return tenants.data?.length ?? 0;
    return selectedIds.length;
  }, [audience, selectedIds, tenants.data]);

  const send = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/admin/announcements", {
        title,
        message,
        audience,
        tenantIds: audience === "SELECTED" ? selectedIds : undefined,
      });
      return data.data as { recipients: number };
    },
    onSuccess: (data) => {
      setNotice(`Announcement sent to ${data.recipients} tenant(s).`);
      setTitle("");
      setMessage("");
      setSelectedIds([]);
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Send failed"
          : "Send failed",
      ),
  });

  function toggleTenant(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Broadcast
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
          Announcements
        </h1>
        <p className="mt-1 text-[var(--muted)]">
          Send to all active restaurants or a selected subset (inbox + email if
          enabled).
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

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <form
          className="space-y-4 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            send.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-white">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-white">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              className="min-h-40 w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
            />
          </label>

          <fieldset className="space-y-2 text-sm text-white">
            <legend className="mb-1 font-medium">Audience</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={audience === "ALL_ACTIVE"}
                onChange={() => setAudience("ALL_ACTIVE")}
              />
              All active tenants
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={audience === "SELECTED"}
                onChange={() => setAudience("SELECTED")}
              />
              Selected tenants
            </label>
          </fieldset>

          <button
            type="submit"
            disabled={
              send.isPending ||
              (audience === "SELECTED" && selectedIds.length === 0)
            }
            className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)] disabled:opacity-50"
          >
            {send.isPending
              ? "Sending…"
              : `Send to ${recipientCount} tenant${recipientCount === 1 ? "" : "s"}`}
          </button>
        </form>

        <aside className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
            {audience === "ALL_ACTIVE" ? "Audience preview" : "Select tenants"}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {audience === "ALL_ACTIVE"
              ? `${tenants.data?.length ?? 0} active tenants will receive this announcement.`
              : `${selectedIds.length} selected.`}
          </p>
          {audience === "SELECTED" && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(tenants.data?.map((t) => t.id) ?? [])
                }
                className="rounded-full border border-white/15 px-3 py-1 text-xs hover:border-[var(--gold)]"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded-full border border-white/15 px-3 py-1 text-xs hover:border-[var(--gold)]"
              >
                Clear
              </button>
            </div>
          )}
          <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto text-sm">
            {tenants.data?.map((tenant) => (
              <li key={tenant.id}>
                {audience === "ALL_ACTIVE" ? (
                  <div className="rounded-lg bg-[var(--panel-2)] px-3 py-2 text-white">
                    {tenant.businessName}
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-[var(--panel-2)] px-3 py-2 text-white">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(tenant.id)}
                      onChange={() => toggleTenant(tenant.id)}
                    />
                    <span>
                      {tenant.businessName}
                      <span className="block text-xs text-[var(--muted)]">
                        {tenant.email}
                      </span>
                    </span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
