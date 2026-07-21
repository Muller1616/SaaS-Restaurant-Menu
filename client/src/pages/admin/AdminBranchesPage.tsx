import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AdminPagination } from "../../components/AdminPagination";
import { api, type ApiSuccess } from "../../lib/api";
import {
  filterOptionLabel,
  subscriptionStatusLabel,
  tenantStatusLabel,
} from "../../lib/status-labels";

type BranchRow = {
  id: string;
  name: string;
  location: string;
  phone: string | null;
  slug: string;
  isActive: boolean;
  isDefault: boolean;
  deletedAt: string | null;
  createdAt: string;
  itemCount: number;
  tenant: {
    id: string;
    businessName: string;
    email: string;
    status: string;
    slug: string;
  };
  subscription: {
    id: string;
    status: string;
    startDate: string;
    expiryDate: string | null;
    plan: { name: string; slug: string; priceMonthly: string };
  } | null;
};

type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const statusFilters = [
  "ALL",
  "TRIAL",
  "ACTIVE",
  "GRACE_PERIOD",
  "EXPIRED",
  "SUSPENDED",
  "CANCELLED",
  "NO_SUBSCRIPTION",
] as const;

async function fetchBranches(params: {
  status: string;
  q: string;
  includeDeleted: boolean;
  page: number;
}) {
  const { data } = await api.get<ApiSuccess<PageResult<BranchRow>>>(
    "/admin/branches",
    {
      params: {
        status: params.status,
        q: params.q || undefined,
        includeDeleted: params.includeDeleted ? "1" : undefined,
        page: params.page,
        pageSize: 20,
      },
    },
  );
  return data.data;
}

export function AdminBranchesPage() {
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("ALL");
  const [q, setQ] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["admin", "branches", status, q, includeDeleted, page],
    queryFn: () => fetchBranches({ status, q, includeDeleted, page }),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Network
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
          Branches
        </h1>
        <p className="mt-1 text-[var(--muted)]">
          All restaurant locations across the platform.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--muted)]">Search</span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Branch, restaurant, email…"
            className="w-64 rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 text-white outline-none focus:border-[var(--gold)]"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => {
              setIncludeDeleted(e.target.checked);
              setPage(1);
            }}
            className="accent-[var(--gold)]"
          />
          Include deleted
        </label>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {statusFilters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setStatus(item);
              setPage(1);
            }}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide",
              status === item
                ? "bg-[var(--gold)] text-[var(--night)]"
                : "border border-white/15 text-[var(--muted)] hover:border-[var(--gold)]",
            ].join(" ")}
          >
            {filterOptionLabel(item, "subscription")}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel-2)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Subscription</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.map((row) => (
              <tr
                key={row.id}
                className="border-t border-[var(--line)] hover:bg-white/4"
              >
                <td className="px-4 py-3">
                  <p className="font-semibold text-white">
                    {row.name}
                    {row.isDefault && (
                      <span className="ml-2 text-xs text-[var(--gold)]">
                        default
                      </span>
                    )}
                    {row.deletedAt && (
                      <span className="ml-2 text-xs text-[var(--danger)]">
                        deleted
                      </span>
                    )}
                  </p>
                  <p className="text-[var(--muted)]">{row.location}</p>
                  <p className="text-xs text-[var(--muted)]">/{row.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/admin/tenants?highlight=${row.tenant.id}`}
                    className="font-semibold text-white hover:text-[var(--gold-soft)]"
                  >
                    {row.tenant.businessName}
                  </Link>
                  <p className="text-[var(--muted)]">{row.tenant.email}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {tenantStatusLabel(row.tenant.status)}
                  </p>
                </td>
                <td className="px-4 py-3 text-white">
                  {row.subscription?.plan.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-white">
                  {row.subscription
                    ? subscriptionStatusLabel(row.subscription.status)
                    : subscriptionStatusLabel("NO_SUBSCRIPTION")}
                  {row.subscription?.expiryDate && (
                    <span className="block text-xs text-[var(--muted)]">
                      exp{" "}
                      {new Date(
                        row.subscription.expiryDate,
                      ).toLocaleDateString()}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-white">{row.itemCount}</td>
                <td className="px-4 py-3 whitespace-nowrap text-white/85">
                  {new Date(row.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {query.data?.items.length === 0 && (
          <p className="px-4 py-10 text-center text-[var(--muted)]">
            No branches match these filters.
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
