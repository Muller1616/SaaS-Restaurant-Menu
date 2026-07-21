import type { ReactNode } from "react";
import { chartTheme } from "./chart-theme";

export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6",
        className,
      ].join(" ")}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-2xl text-white sm:text-3xl">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-white/10 px-4 text-center text-sm text-[var(--muted)]">
      {message}
    </div>
  );
}

export function ChartLoading({ label = "Loading chart…" }: { label?: string }) {
  return (
    <div className="flex h-56 items-center justify-center text-sm text-[var(--muted)]">
      {label}
    </div>
  );
}

type KpiAccent = "primary" | "secondary" | "accent" | "success" | "warning" | "danger";

const KPI_ACCENTS: Record<KpiAccent, string> = {
  primary: chartTheme.primary,
  secondary: chartTheme.secondary,
  accent: chartTheme.accent,
  success: chartTheme.success,
  warning: chartTheme.warning,
  danger: chartTheme.danger,
};

export function KpiCard({
  label,
  value,
  hint,
  emphasize,
  accent = "primary",
}: {
  label: string;
  value: string | number;
  hint?: string;
  emphasize?: boolean;
  accent?: KpiAccent;
}) {
  const accentColor = KPI_ACCENTS[accent];

  return (
    <div
      className={[
        "relative overflow-hidden rounded-[1.75rem] border p-5",
        emphasize
          ? "border-white/15 bg-[linear-gradient(145deg,rgba(91,141,239,0.16),rgba(18,26,23,0.96)_50%)]"
          : "border-[var(--line)] bg-[var(--panel)]",
      ].join(" ")}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${accentColor}, transparent 85%)`,
        }}
      />
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">
        {value}
      </p>
      {hint && <p className="mt-2 text-sm text-[var(--muted)]">{hint}</p>}
    </div>
  );
}
