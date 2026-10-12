export interface SheetTotalRow {
  label: string;
  // Smaller grey text under the label (e.g. which year the sheet covers).
  note?: string;
  value: number;
}

const formatMoney = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "Label 1 .... 1,234  /  Label 2 .... 2,342  /  + ----  /  Total .... 3,576" —
// the sum of a figure across the linked sheets, written out like an addition.
export function SheetTotalsCard({
  title,
  subtitle,
  rows,
  totalLabel = "Total",
  extras = [],
}: {
  title: string;
  subtitle?: string;
  rows: SheetTotalRow[];
  totalLabel?: string;
  // Extra figures listed under the total (e.g. a line-item count).
  extras?: { label: string; value: string; note?: string }[];
}) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return (
    <div className="h-full w-full rounded-xl border border-border bg-card p-5 sm:p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</p>
      {subtitle && <p className="mt-0.5 text-[10px] italic leading-tight text-muted-foreground/70">{subtitle}</p>}

      <div className="mt-3 flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <p className="break-words text-sm text-foreground">{r.label}</p>
              {r.note && <p className="text-[10px] text-muted-foreground">{r.note}</p>}
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatMoney(r.value)}</p>
          </div>
        ))}
      </div>

      {/* the "+" and the rule under the numbers, like a written-out sum */}
      <div className="mt-2 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-muted-foreground">+</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-4">
        <p className="text-sm font-bold uppercase tracking-wide text-foreground">{totalLabel}</p>
        <p className="text-xl font-bold tabular-nums text-foreground">{formatMoney(total)}</p>
      </div>

      {extras.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
          {extras.map((x) => (
            <div key={x.label} className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-foreground">{x.label}</p>
                {x.note && <p className="text-[10px] italic leading-tight text-muted-foreground/70">{x.note}</p>}
              </div>
              <p className="shrink-0 text-base font-bold tabular-nums text-foreground">{x.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
