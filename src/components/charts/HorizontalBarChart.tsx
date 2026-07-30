import { useState } from "react";
import type { ChartSeries } from "./MonthlyBarChart";

// Same validated categorical slots as MonthlyBarChart — kept in sync so a
// series (e.g. "SARO") always reads as the same color across both charts.
const CHART_SERIES_COLORS = [
  { bg: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  { bg: "bg-[#eb6834] dark:bg-[#d95926]" },
  { bg: "bg-[#1baf7a] dark:bg-[#199e70]" },
] as const;

interface HorizontalBarChartProps {
  title: string;
  subtitle?: string;
  categories: string[]; // top-to-bottom order, already sorted/truncated by the caller
  series: ChartSeries[];
  data: Record<string, number[]>; // series.key -> value per category (aligned to categories)
  formatValue: (n: number) => string;
  footerNote?: string;
}

// Round a max value up to a "clean" gridline ceiling (1/2/5 × 10^n).
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = value / 10 ** exp;
  const niceBase = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return niceBase * 10 ** exp;
}

export default function HorizontalBarChart({ title, subtitle, categories, series, data, formatValue, footerNote }: HorizontalBarChartProps) {
  const [hover, setHover] = useState<{ category: string; seriesKey: string } | null>(null);

  const maxValue = niceCeiling(
    Math.max(1, ...categories.flatMap((_, i) => series.map((s) => data[s.key]?.[i] || 0)))
  );

  if (categories.length === 0) {
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
      <div className="flex items-start justify-between mb-1 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {/* Legend — line-keys, never color-only identity */}
        <div className="flex items-center gap-4">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className={`inline-block w-3 h-2 rounded-sm ${CHART_SERIES_COLORS[s.colorIndex].bg}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-4">
        {categories.map((category, i) => (
          <div key={category} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-xs text-foreground truncate text-right" title={category}>
              {category}
            </span>
            <div className="flex-1 flex flex-col gap-1">
              {series.map((s) => {
                const value = data[s.key]?.[i] || 0;
                const widthPct = Math.max(0, Math.min(100, (value / maxValue) * 100));
                const isHovered = hover?.category === category && hover?.seriesKey === s.key;
                return (
                  <div key={s.key} className="relative flex items-center h-3">
                    <button
                      type="button"
                      className={`h-full rounded-r-[4px] transition-opacity hover:opacity-80 focus:opacity-80 focus:outline-none ${CHART_SERIES_COLORS[s.colorIndex].bg}`}
                      style={{ width: `${widthPct}%`, minWidth: value > 0 ? 3 : 0 }}
                      onMouseEnter={() => setHover({ category, seriesKey: s.key })}
                      onFocus={() => setHover({ category, seriesKey: s.key })}
                      onMouseLeave={() => setHover(null)}
                      onBlur={() => setHover(null)}
                      aria-label={`${category}, ${s.label}: ${formatValue(value)}`}
                    />
                    {isHovered && (
                      <div className="absolute z-10 left-0 -translate-y-full -mt-1 bg-popover border border-border rounded-lg shadow-lg px-2.5 py-1.5 pointer-events-none whitespace-nowrap">
                        <p className="text-[11px] font-medium text-foreground">{category}</p>
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className={`inline-block w-2.5 h-2 rounded-sm ${CHART_SERIES_COLORS[s.colorIndex].bg}`} />
                          <span className="font-semibold text-foreground">{formatValue(value)}</span>
                          <span className="text-muted-foreground">{s.label}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {footerNote && <p className="text-[11px] text-muted-foreground text-center mt-4">{footerNote}</p>}
    </div>
  );
}
