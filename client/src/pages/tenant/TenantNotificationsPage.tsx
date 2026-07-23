import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type ApiSuccess } from "../../lib/api";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

async function fetchNotifications() {
  const { data } = await api.get<ApiSuccess<Notification[]>>(
    "/tenant/settings/notifications",
  );
  return data.data;
}

export function TenantNotificationsPage() {
  const queryClient = useQueryClient();
  const { tenant } = useTenantAuth();

  const query = useQuery({
    queryKey: ["tenant", "notifications"],
    queryFn: fetchNotifications,
  });

  const markAll = useMutation({
    mutationFn: async () => api.post("/tenant/settings/notifications/read-all"),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant", "notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["tenant", "notifications", "unread"],
      });
    },
  });

  const markOne = useMutation({
    mutationFn: async (id: string) =>
      api.post(`/tenant/settings/notifications/${id}/read`),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant", "notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["tenant", "notifications", "unread"],
      });
    },
  });

  const unread = query.data?.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
            Inbox
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-4xl text-white">
            Notifications
          </h2>
          <p className="mt-2 text-[var(--muted)]">
            Messages and updates for {tenant?.businessName}.{" "}
            <span className="text-[var(--gold-soft)]">
              {unread} unread
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => markAll.mutate()}
            className="rounded-full border border-white/15 px-4 py-2 text-sm"
          >
            Mark all as read
          </button>
          <Link
            to="/tenant/settings"
            className="rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--night)]"
          >
            Email settings
          </Link>
        </div>
      </div>

      {query.isLoading && <p className="text-[var(--muted)]">Loading…</p>}
      {query.data?.length === 0 && (
        <div className="rounded-[1.75rem] border border-dashed border-white/15 px-6 py-14 text-center text-[var(--muted)]">
          Your inbox is empty. Updates about your plan and account will show up
          here.
        </div>
      )}

      <div className="space-y-3">
        {query.data?.map((item) => (
          <article
            key={item.id}
            className={[
              "rounded-[1.5rem] border p-5 transition",
              item.isRead
                ? "border-[var(--line)] bg-[var(--panel)]"
                : "border-[var(--gold)]/40 bg-[rgba(212,165,116,0.08)]",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] tracking-[0.2em] text-[var(--gold)] uppercase">
                  {item.type}
                </p>
                <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">{item.message}</p>
                <p className="mt-3 text-xs text-white/40">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              {!item.isRead && (
                <button
                  type="button"
                  onClick={() => markOne.mutate(item.id)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs"
                >
                  Mark read
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
