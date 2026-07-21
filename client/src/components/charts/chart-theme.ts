export const chartTheme = {
  gold: "#d4a574",
  goldSoft: "#e8c49a",
  ember: "#ff8b5c",
  success: "#3dba8a",
  danger: "#ff6b6b",
  muted: "rgba(238,242,239,0.68)",
  grid: "rgba(232,196,154,0.12)",
  tooltipBg: "#121a17",
  tooltipBorder: "rgba(232,196,154,0.28)",
  palette: ["#d4a574", "#e8c49a", "#ff8b5c", "#3dba8a", "#7eb8ff", "#c4a1ff"],
} as const;

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
