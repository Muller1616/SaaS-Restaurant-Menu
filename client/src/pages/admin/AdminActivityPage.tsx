import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AdminPagination } from "../../components/AdminPagination";
import { api, type ApiSuccess } from "../../lib/api";
import {
  activityActionLabel,
  activityActorLabel,
} from "../../lib/status-labels";

const ACTIVITY_PAGE_SIZE = 11;

type Log = {
  id: string;
  userType: string;
  userId: string;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  summary: string;
  details: unknown;
  createdAt: string;
};

type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function entityTypeLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDetails(details: unknown) {
  if (details == null) return "—";
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details, null, 0);
  } catch {
    return "—";
  }
}

async function fetchLogs(page: number) {
  const { data } = await api.get<ApiSuccess<PageResult<Log>>>(
    "/admin/activity-logs",
    { params: { page, pageSize: ACTIVITY_PAGE_SIZE } },
  );
  return data.data;
}

export function AdminActivityPage() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin", "activity-logs", page],
    queryFn: () => fetchLogs(page),
  });

  useEffect(() => {
    if (!query.data) return;
    if (page > query.data.totalPages) {
      setPage(Math.max(1, query.data.totalPages));
    }
  }, [query.data, page]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Audit trail
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
          Activity log
        </h1>
        <p className="mt-1 text-[var(--muted)]">
          Recent admin and restaurant actions across KitchenOS.
        </p>
      </div>

      <div className="overflow-x-auto overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-[var(--panel-2)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Summary</th>
              <th className="px-4 py-3">Who</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.map((log) => (
              <tr
                key={log.id}
                className="border-t border-[var(--line)] hover:bg-white/4"
              >
                <td className="px-4 py-3 whitespace-nowrap text-white/85">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="max-w-sm px-4 py-3 text-white">
                  <p className="leading-snug">
                    {log.summary ||
                      `${activityActorLabel(log.userType)} · ${activityActionLabel(log.action)}`}
                  </p>
                  {log.details != null && (
                    <p className="mt-1 truncate text-xs text-[var(--muted)]" title={formatDetails(log.details)}>
                      {formatDetails(log.details)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-white">
                  {log.actorLabel || activityActorLabel(log.userType)}
                </td>
                <td className="px-4 py-3 font-medium text-white">
                  {activityActionLabel(log.action)}
                </td>
                <td className="px-4 py-3 text-white">
                  <p>{log.entityLabel || entityTypeLabel(log.entityType)}</p>
                  {log.entityLabel && (
                    <span className="block text-xs text-[var(--muted)]">
                      {entityTypeLabel(log.entityType)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {query.data?.items.length === 0 && (
          <p className="px-4 py-10 text-center text-[var(--muted)]">
            No recent activity.
          </p>
        )}
      </div>

      {query.data && (
        <AdminPagination
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
