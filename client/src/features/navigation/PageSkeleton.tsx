import type { ReactNode } from "react";

/** Fixed-height loading placeholders to prevent layout shift while data loads. */
export function PageSkeleton({
  rows = 4,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={["space-y-4", className].filter(Boolean).join(" ")}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="h-8 w-48 animate-pulse rounded-lg bg-white/8" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded bg-white/6" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: Math.min(rows, 3) }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)]"
          />
        ))}
      </div>
      {rows > 3 && (
        <div className="h-64 animate-pulse rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)]" />
      )}
    </div>
  );
}

export function PageFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["space-y-6", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
