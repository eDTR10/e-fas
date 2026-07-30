import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useIsDarkMode } from "@/lib/useIsDarkMode";
import type { ChartSeries } from "./MonthlyBarChart";

// Same validated categorical slots as the other dashboard charts, as plain
// hex (Recharts fills need a real color value, not a Tailwind class).
const SERIES_COLORS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a"],
  dark: ["#3987e5", "#d95926", "#199e70"],
};

const CHROME = {
  light: { text: "#52514e", surface: "#fcfcfb", border: "#e1e0d9" },
  dark: { text: "#c3c2b7", surface: "#1a1a19", border: "#2c2c2a" },
};

interface DonutChartProps {
  title: string;
  subtitle?: string;
  series: ChartSeries[]; // 2-6 categories sharing one combined total
  data: Record<string, number>; // series.key -> single total value
  formatValue: (n: number) => string;
}

// Part-to-whole across the grand totals (not per-record like the horizontal
// breakdown charts) — a donut is legitimate here because the job is exactly
// "compare totals at a glance," each slice is direct-labeled by percentage,
// and the center figure carries the one number that matters (the combined
// total), same role a stat tile would play alone.
export default function DonutChart({ title, subtitle, series, data, formatValue }: DonutChartProps) {
  const isDark = useIsDarkMode();
  const palette = isDark ? SERIES_COLORS.dark : SERIES_COLORS.light;
  const chrome = isDark ? CHROME.dark : CHROME.light;

  const total = series.reduce((s, x) => s + (data[x.key] || 0), 0);

  if (total <= 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>}
        <p className="text-sm text-muted-foreground py-10 text-center">No data for the selected filters.</p>
      </div>
    );
  }

  const chartData = series.map((s) => ({
    key: s.key,
    name: s.label,
    value: data[s.key] || 0,
    colorIndex: s.colorIndex,
  }));

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="mb-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="relative" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="90%"
              paddingAngle={3}
              stroke="none"
              label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {chartData.map((d) => (
                <Cell key={d.key} fill={palette[d.colorIndex]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: chrome.surface, border: `1px solid ${chrome.border}`, borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: chrome.text, fontWeight: 600 }}
              formatter={(value, name) => [formatValue(Number(value)), String(name)]}
            />
            <Legend
              verticalAlign="bottom"
              height={28}
              wrapperStyle={{ fontSize: 11, color: chrome.text }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center figure — the combined total, the one number this chart leads with */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ bottom: 28 }}>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</span>
          <span className="text-lg font-semibold text-foreground">{formatValue(total)}</span>
        </div>
      </div>
    </div>
  );
}
