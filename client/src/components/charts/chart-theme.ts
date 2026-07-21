/**
 * Centralized analytics color system for KitchenOS dashboards.
 * Keep all chart / KPI / legend colors sourced from here.
 */

export const chartTheme = {
  /** Primary metric (trends, main KPI series) */
  primary: "#5B8DEF",
  primarySoft: "#8BB4FF",
  /** Comparison / secondary series */
  secondary: "#2DD4BF",
  secondarySoft: "#5EEAD4",
  /** Brand-aligned highlight */
  accent: "#F5B942",
  accentSoft: "#FCD34D",
  /** Additional categorical accents */
  violet: "#A78BFA",
  rose: "#FB7185",
  sky: "#38BDF8",
  orange: "#FB923C",

  success: "#22C55E",
  successSoft: "#4ADE80",
  warning: "#F59E0B",
  warningSoft: "#FBBF24",
  danger: "#F43F5E",
  dangerSoft: "#FB7185",
  neutral: "#94A3B8",

  /** @deprecated Prefer `accent` — kept for older call sites */
  gold: "#F5B942",
  goldSoft: "#FCD34D",
  ember: "#FB923C",

  muted: "rgba(226, 232, 240, 0.72)",
  grid: "rgba(148, 163, 184, 0.16)",
  axis: "rgba(226, 232, 240, 0.55)",
  tooltipBg: "rgba(12, 18, 24, 0.96)",
  tooltipBorder: "rgba(91, 141, 239, 0.35)",
  cursorFill: "rgba(91, 141, 239, 0.1)",
  legend: "rgba(226, 232, 240, 0.78)",

  /**
   * Categorical palette — high contrast on dark panels, colorblind-friendlier
   * order (blue → teal → amber → rose → violet → green → sky → orange).
   */
  palette: [
    "#5B8DEF",
    "#2DD4BF",
    "#F5B942",
    "#FB7185",
    "#A78BFA",
    "#34D399",
    "#38BDF8",
    "#FB923C",
  ],
} as const;

/** Semantic colors for known status / method keys (API enums or display labels). */
const CATEGORY_COLOR_MAP: Record<string, string> = {
  // Subscription
  ACTIVE: chartTheme.success,
  TRIAL: chartTheme.primary,
  "ON TRIAL": chartTheme.primary,
  NEARLY_EXPIRED: chartTheme.warning,
  "EXPIRING SOON": chartTheme.warning,
  GRACE_PERIOD: chartTheme.orange,
  "IN GRACE PERIOD": chartTheme.orange,
  EXPIRED: chartTheme.danger,
  SUSPENDED: chartTheme.rose,
  CANCELLED: chartTheme.neutral,
  "NO PLAN YET": chartTheme.neutral,
  NO_SUBSCRIPTION: chartTheme.neutral,

  // Payments
  PENDING: chartTheme.warning,
  "AWAITING REVIEW": chartTheme.warning,
  APPROVED: chartTheme.success,
  CONFIRMED: chartTheme.success,
  REJECTED: chartTheme.danger,
  DECLINED: chartTheme.danger,

  // Payment methods
  BANK_TRANSFER: chartTheme.primary,
  "BANK TRANSFER": chartTheme.primary,
  TELEBIRR: chartTheme.secondary,
  CASH: chartTheme.accent,

  // Devices (API title case)
  MOBILE: chartTheme.primary,
  DESKTOP: chartTheme.secondary,
  TABLET: chartTheme.accent,
  UNKNOWN: chartTheme.neutral,
};

function normalizeKey(value: string) {
  return value.trim().toUpperCase().replaceAll("_", " ");
}

/** Stable color for a named category (status, method, device, etc.). */
export function colorForCategory(name: string | number | null | undefined) {
  if (name == null || name === "") return chartTheme.neutral;
  const raw = String(name);
  const spaced = normalizeKey(raw);
  const underscored = spaced.replaceAll(" ", "_");

  return (
    CATEGORY_COLOR_MAP[spaced] ??
    CATEGORY_COLOR_MAP[underscored] ??
    chartTheme.palette[
      Math.abs(hashString(spaced)) % chartTheme.palette.length
    ]!
  );
}

/** Soft tint helpers for status pills / progress bars (rgba strings). */
export function toneForCategory(name: string | number | null | undefined) {
  const color = colorForCategory(name);
  return {
    solid: color,
    softBg: hexToRgba(color, 0.14),
    softBorder: hexToRgba(color, 0.35),
  };
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Indexed series color from the shared palette. */
export function colorForSeries(index: number) {
  const palette = chartTheme.palette;
  return palette[((index % palette.length) + palette.length) % palette.length]!;
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function formatChartDate(isoDate: string) {
  const [, month, day] = isoDate.split("-");
  return `${month}/${day}`;
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}
