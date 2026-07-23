/**
 * Consistent Admin Panel date/time formatting.
 * Example: "Feb 7, 2026, 6:44:06 PM"
 */
export function formatAdminDateTime(value: string | Date | null | undefined) {
  if (value == null) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Date-only (expiry, start dates). Example: "Feb 7, 2026" */
export function formatAdminDate(value: string | Date | null | undefined) {
  if (value == null) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
