import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  chartTheme,
  colorForCategory,
  colorForSeries,
  formatChartDate,
  formatCompactNumber,
} from "./chart-theme";

type Point = Record<string, string | number>;

const tooltipStyle = {
  backgroundColor: chartTheme.tooltipBg,
  border: `1px solid ${chartTheme.tooltipBorder}`,
  borderRadius: 14,
  color: "#eef2ef",
  fontSize: 12,
  boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
};

const axisTick = { fill: chartTheme.axis, fontSize: 11 };

export function TrendAreaChart({
  data,
  xKey,
  yKey,
  yLabel,
  color = chartTheme.primary,
  emptyMessage = "Nothing to show for this period yet.",
}: {
  data: Point[];
  xKey: string;
  yKey: string;
  yLabel?: string;
  color?: string;
  emptyMessage?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const hasValues = data.some((row) => Number(row[yKey] ?? 0) > 0);
  if (!hasValues) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="h-64 w-full min-w-0 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <stop offset="55%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(v) => formatChartDate(String(v))}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v) => formatCompactNumber(Number(v))}
          />
          <Tooltip
            cursor={{ stroke: chartTheme.primarySoft, strokeWidth: 1, strokeDasharray: "4 4" }}
            contentStyle={tooltipStyle}
            labelFormatter={(label) => String(label)}
            formatter={(value) => [
              formatCompactNumber(Number(value ?? 0)),
              yLabel ?? yKey,
            ]}
          />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={color}
            strokeWidth={2.75}
            fill={`url(#${gradientId})`}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#0c1218", fill: color }}
            animationDuration={750}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ComparisonBarChart({
  data,
  xKey,
  yKey,
  yLabel,
  color = chartTheme.secondary,
  colorByCategory = false,
  emptyMessage = "Nothing to chart just yet.",
}: {
  data: Point[];
  xKey: string;
  yKey: string;
  yLabel?: string;
  color?: string;
  /** When true, each bar uses `colorForCategory(row[xKey])`. */
  colorByCategory?: boolean;
  emptyMessage?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const hasValues = data.some((row) => Number(row[yKey] ?? 0) > 0);
  if (!hasValues) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="h-64 w-full min-w-0 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={1} />
              <stop offset="100%" stopColor={color} stopOpacity={0.65} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            tickFormatter={(v) =>
              String(v).includes("-") ? formatChartDate(String(v)) : String(v)
            }
          />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v) => formatCompactNumber(Number(v))}
          />
          <Tooltip
            cursor={{ fill: chartTheme.cursorFill }}
            contentStyle={tooltipStyle}
            formatter={(value) => [
              formatCompactNumber(Number(value ?? 0)),
              yLabel ?? yKey,
            ]}
          />
          <Bar
            dataKey={yKey}
            fill={colorByCategory ? undefined : `url(#${gradientId})`}
            radius={[8, 8, 2, 2]}
            animationDuration={750}
            maxBarSize={48}
          >
            {colorByCategory
              ? data.map((row, index) => (
                  <Cell
                    key={`${String(row[xKey])}-${index}`}
                    fill={colorForCategory(row[xKey])}
                  />
                ))
              : null}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DistributionDonutChart({
  data,
  nameKey,
  valueKey,
  emptyMessage = "No breakdown to show yet.",
}: {
  data: Point[];
  nameKey: string;
  valueKey: string;
  emptyMessage?: string;
}) {
  const filtered = data.filter((row) => Number(row[valueKey] ?? 0) > 0);
  if (filtered.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="h-64 w-full min-w-0 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey={valueKey}
            nameKey={nameKey}
            innerRadius="56%"
            outerRadius="80%"
            paddingAngle={3}
            stroke="#0c1218"
            strokeWidth={2}
            animationDuration={750}
          >
            {filtered.map((row, index) => (
              <Cell
                key={`${String(row[nameKey])}-${index}`}
                fill={
                  colorForCategory(row[nameKey]) || colorForSeries(index)
                }
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => formatCompactNumber(Number(value ?? 0))}
          />
          <Legend
            verticalAlign="bottom"
            height={40}
            iconType="circle"
            wrapperStyle={{ color: chartTheme.legend, fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DualAxisPaymentsChart({
  data,
}: {
  data: Array<{ date: string; count: number; approvedAmount: number }>;
}) {
  const submissionsGradient = useId().replace(/:/g, "");
  const amountGradient = useId().replace(/:/g, "");
  const hasValues = data.some((row) => row.count > 0 || row.approvedAmount > 0);
  if (!hasValues) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        No payment activity in the last 30 days — new submissions will show here.
      </div>
    );
  }

  return (
    <div className="h-64 w-full min-w-0 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={submissionsGradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.primary} stopOpacity={1} />
              <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id={amountGradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.success} stopOpacity={1} />
              <stop offset="100%" stopColor={chartTheme.success} stopOpacity={0.7} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => formatChartDate(String(v))}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            yAxisId="left"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => formatCompactNumber(Number(v))}
          />
          <Tooltip
            cursor={{ fill: chartTheme.cursorFill }}
            contentStyle={tooltipStyle}
            labelFormatter={(label) => String(label)}
            formatter={(value, name) => [
              formatCompactNumber(Number(value ?? 0)),
              name === "approvedAmount" ? "Confirmed ETB" : "Submissions",
            ]}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ color: chartTheme.legend, fontSize: 12 }}
          />
          <Bar
            yAxisId="left"
            dataKey="count"
            name="Submissions"
            fill={`url(#${submissionsGradient})`}
            radius={[8, 8, 2, 2]}
            maxBarSize={28}
          />
          <Bar
            yAxisId="right"
            dataKey="approvedAmount"
            name="Confirmed ETB"
            fill={`url(#${amountGradient})`}
            radius={[8, 8, 2, 2]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
