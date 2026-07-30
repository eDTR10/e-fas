import { useState } from "react";

// Validated categorical slots (dataviz skill, first 3 — the pair that
// clears the CVD/normal-vision floors for all-pairs comparison, not just
// adjacent). Light / dark hex per slot.
const CHART_SERIES_COLORS = [
  { bg: "bg-[#2a78d6] dark:bg-[#3987e5]", line: "#2a78d6" },
  { bg: "bg-[#eb6834] dark:bg-[#d95926]", line: "#eb6834" },
  { bg: "bg-[#1baf7a] dark:bg-[#199e70]", line: "#1baf7a" },
] as const;

export interface ChartSeries {
  key: string;
  label: string;
  colorIndex: 0 | 1 | 2;
}

interface MonthlyBarChartProps {
  title: string;
  subtitle?: string;
  months: string[]; // "YYYY-MM", ascending
  series: ChartSeries[];
  data: Record<string, number[]>; // series.key -> value per month (aligned to months)
  formatValue: (n: number) => string;
}

const monthTickLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
};

// Round a max value up to a "clean" gridline ceiling (1/2/5 × 10^n).
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = value / 10 ** exp;
  const niceBase = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return niceBase * 10 ** exp;
}

export default function MonthlyBarChart({ title, subtitle, months, series, data, formatValue }: MonthlyBarChartProps) {
  const [hover, setHover] = useState<{ month: string; x: number; y: number } | null>(null);

  const maxValue = niceCeiling(
    Math.max(1, ...months.flatMap((_, i) => series.map((s) => data[s.key]?.[i] || 0)))
  );
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  if (months.length === 0) {
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
              <span className={`inline-block w-3 h-0.5 rounded-full ${CHART_SERIES_COLORS[s.colorIndex].bg}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex mt-4">
        {/* Y axis */}
        <div className="flex flex-col justify-between h-48 pr-2 shrink-0" style={{ width: 56 }}>
          {gridSteps.slice().reverse().map((step) => (
            <span key={step} className="text-[10px] text-muted-foreground text-right leading-none">
              {formatValue(maxValue * step)}
            </span>
          ))}
        </div>

        {/* Plot area */}
        <div className="flex-1 relative h-48">
          {/* Recessive gridlines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {gridSteps.map((step) => (
              <div key={step} className="border-t border-border/60" />
            ))}
          </div>

          {/* Bars */}
          <div className="absolute inset-0 flex items-end justify-around gap-1 px-1">
            {months.map((month, i) => (
              <div key={month} className="flex items-end gap-0.5 h-full">
                {series.map((s) => {
                  const value = data[s.key]?.[i] || 0;
                  const heightPct = Math.max(0, Math.min(100, (value / maxValue) * 100));
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`w-2.5 max-w-[24px] rounded-t-[4px] transition-opacity hover:opacity-80 focus:opacity-80 focus:outline-none ${CHART_SERIES_COLORS[s.colorIndex].bg}`}
                      style={{ height: `${heightPct}%`, minHeight: value > 0 ? 2 : 0 }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const parentRect = e.currentTarget.closest(".relative")?.getBoundingClientRect();
                        setHover({ month, x: rect.left - (parentRect?.left ?? 0) + rect.width / 2, y: rect.top - (parentRect?.top ?? 0) });
                      }}
                      onFocus={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const parentRect = e.currentTarget.closest(".relative")?.getBoundingClientRect();
                        setHover({ month, x: rect.left - (parentRect?.left ?? 0) + rect.width / 2, y: rect.top - (parentRect?.top ?? 0) });
                      }}
                      onMouseLeave={() => setHover(null)}
                      onBlur={() => setHover(null)}
                      aria-label={`${monthTickLabel(month)}, ${s.label}: ${formatValue(value)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Tooltip — every series at the hovered month */}
          {hover && (
            <div
              className="absolute z-10 -translate-x-1/2 -translate-y-full mb-2 bg-popover border border-border rounded-lg shadow-lg px-3 py-2 pointer-events-none whitespace-nowrap"
              style={{ left: hover.x, top: hover.y }}
            >
              <p className="text-[11px] font-medium text-foreground mb-1">{monthTickLabel(hover.month)} {hover.month.slice(0, 4)}</p>
              {series.map((s) => {
                const idx = months.indexOf(hover.month);
                const value = data[s.key]?.[idx] || 0;
                return (
                  <div key={s.key} className="flex items-center gap-2 text-[11px]">
                    <span className={`inline-block w-2.5 h-0.5 rounded-full ${CHART_SERIES_COLORS[s.colorIndex].bg}`} />
                    <span className="font-semibold text-foreground">{formatValue(value)}</span>
                    <span className="text-muted-foreground">{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* X axis labels */}
      <div className="flex justify-around px-1 pl-[60px] mt-1.5">
        {months.map((m) => (
          <span key={m} className="text-[10px] text-muted-foreground">{monthTickLabel(m)}</span>
        ))}
      </div>
    </div>
  );
}
