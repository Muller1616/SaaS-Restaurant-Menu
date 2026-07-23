type Props = {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function AdminPagination({
  page,
  totalPages,
  total,
  onPageChange,
}: Props) {
  if (total === 0 || totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-[var(--muted)]">
        {total} result{total === 1 ? "" : "s"} · page {page} of {totalPages}
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-full border border-white/15 px-4 py-1.5 disabled:opacity-40 hover:border-[var(--gold)]"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-full border border-white/15 px-4 py-1.5 disabled:opacity-40 hover:border-[var(--gold)]"
        >
          Next
        </button>
      </div>
    </div>
  );
}
