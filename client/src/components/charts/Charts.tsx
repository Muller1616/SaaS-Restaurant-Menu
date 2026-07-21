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
import { chartTheme, formatChartDate, formatCompactNumber } from "./chart-theme";

type Point = Record<string, string | number>;

const tooltipStyle = {
  backgroundColor: chartTheme.tooltipBg,
  border: `1px solid ${chartTheme.tooltipBorder}`,
  borderRadius: 12,
  color: "#eef2ef",
  fontSize: 12,
};

export function TrendAreaChart({
  data,
  xKey,
  yKey,
  yLabel,
  color = chartTheme.gold,
  emptyMessage = "No data in this period yet.",
}: {
  data: Point[];
  xKey: string;
  yKey: string;
  yLabel?: string;
  color?: string;
  emptyMessage?: string;
}) {
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
            <linearGradient id={`fill-${yKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(v) => formatChartDate(String(v))}
            tick={{ fill: chartTheme.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: chartTheme.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v) => formatCompactNumber(Number(v))}
          />
          <Tooltip
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
            strokeWidth={2.5}
            fill={`url(#fill-${yKey})`}
            animationDuration={700}
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
  color = chartTheme.goldSoft,
  emptyMessage = "No data available.",
}: {
  data: Point[];
  xKey: string;
  yKey: string;
  yLabel?: string;
  color?: string;
  emptyMessage?: string;
}) {
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
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: chartTheme.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            tickFormatter={(v) =>
              String(v).includes("-") ? formatChartDate(String(v)) : String(v)
            }
          />
          <YAxis
            tick={{ fill: chartTheme.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v) => formatCompactNumber(Number(v))}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [
              formatCompactNumber(Number(value ?? 0)),
              yLabel ?? yKey,
            ]}
          />
          <Bar
            dataKey={yKey}
            fill={color}
            radius={[6, 6, 0, 0]}
            animationDuration={700}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DistributionDonutChart({
  data,
  nameKey,
  valueKey,
  emptyMessage = "No distribution data yet.",
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
            innerRadius="58%"
            outerRadius="78%"
            paddingAngle={2}
            animationDuration={700}
          >
            {filtered.map((_, index) => (
              <Cell
                key={`${String(filtered[index]?.[nameKey])}-${index}`}
                fill={chartTheme.palette[index % chartTheme.palette.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => formatCompactNumber(Number(value ?? 0))}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            wrapperStyle={{ color: chartTheme.muted, fontSize: 12 }}
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
  const hasValues = data.some((row) => row.count > 0 || row.approvedAmount > 0);
  if (!hasValues) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
        No payment activity in the last 30 days.
      </div>
    );
  }

  return (
    <div className="h-64 w-full min-w-0 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => formatChartDate(String(v))}
            tick={{ fill: chartTheme.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: chartTheme.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: chartTheme.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => formatCompactNumber(Number(v))}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label) => String(label)}
            formatter={(value, name) => [
              formatCompactNumber(Number(value ?? 0)),
              name === "approvedAmount" ? "Approved ETB" : "Submissions",
            ]}
          />
          <Legend wrapperStyle={{ color: chartTheme.muted, fontSize: 12 }} />
          <Bar
            yAxisId="left"
            dataKey="count"
            name="Submissions"
            fill={chartTheme.goldSoft}
            radius={[6, 6, 0, 0]}
          />
          <Bar
            yAxisId="right"
            dataKey="approvedAmount"
            name="Approved ETB"
            fill={chartTheme.success}
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
