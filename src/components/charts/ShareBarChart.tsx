import { useState } from "react";
import type { ChartSeries } from "./MonthlyBarChart";

// Same validated categorical slots as MonthlyBarChart/HorizontalBarChart —
// kept in sync (not imported) so each chart file stays independent, matching
// the existing pattern in this directory.
const CHART_SERIES_COLORS = [
  { bg: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  { bg: "bg-[#eb6834] dark:bg-[#d95926]" },
  { bg: "bg-[#1baf7a] dark:bg-[#199e70]" },
] as const;

interface ShareBarChartProps {
  title: string;
  subtitle?: string;
  series: ChartSeries[]; // 2-3 categories sharing one combined total
  data: Record<string, number>; // series.key -> single total value
  formatValue: (n: number) => string;
  /** Optional label + value shown top-right of the header — e.g. the whole
   * being split ("Total SARO") when the bar's own combined total isn't the
   * headline figure the reader should look at first. */
  totalLabel?: string;
  totalValue?: number;
}

// A part-to-whole comparison for a small, fixed set of categories (e.g. SARO
// vs NTCA totals) as one proportional bar rather than a pie — a 2-3 slice pie
// renders as one dominant wedge and slivers that are hard to actually compare,
// where a single bar split by share reads at a glance and keeps every value
// directly labeled underneath (see dataviz anti-patterns: "a 2-slice pie").
export default function ShareBarChart({ title, subtitle, series, data, formatValue, totalLabel, totalValue }: ShareBarChartProps) {
  const [hover, setHover] = useState<string | null>(null);

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

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {totalLabel && totalValue !== undefined && (
          <div className="text-right shrink-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{totalLabel}</p>
            <p className="text-base font-semibold text-foreground">{formatValue(totalValue)}</p>
          </div>
        )}
      </div>

      {/* The bar — one rounded track, segments separated by a 2px surface gap */}
      <div className="flex h-3 w-full rounded-full overflow-hidden gap-[2px] bg-muted">
        {series.map((s) => {
          const value = data[s.key] || 0;
          const pct = (value / total) * 100;
          if (pct <= 0) return null;
          return (
            <button
              key={s.key}
              type="button"
              className={`h-full transition-opacity hover:opacity-80 focus:opacity-80 focus:outline-none first:rounded-l-full last:rounded-r-full ${CHART_SERIES_COLORS[s.colorIndex].bg}`}
              style={{ width: `${pct}%` }}
              onMouseEnter={() => setHover(s.key)}
              onFocus={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              onBlur={() => setHover(null)}
              aria-label={`${s.label}: ${formatValue(value)}, ${pct.toFixed(1)}% of ${formatValue(total)}`}
            />
          );
        })}
      </div>

      {/* Direct labels — every series gets one (there are only 2-3) */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4">
        {series.map((s) => {
          const value = data[s.key] || 0;
          const pct = total > 0 ? (value / total) * 100 : 0;
          return (
            <div
              key={s.key}
              className={`flex items-center gap-2 transition-opacity ${hover && hover !== s.key ? "opacity-50" : ""}`}
            >
              <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${CHART_SERIES_COLORS[s.colorIndex].bg}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="text-sm font-semibold text-foreground">{formatValue(value)}</span>
              <span className="text-xs text-muted-foreground">({pct.toFixed(1)}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
