export interface TopListItem {
  key: string | number;
  label: string;
  // Smaller grey text under the label.
  note?: string;
  value: number;
  onClick?: () => void;
}

const formatMoney = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A ranked "top N" list: rank badge, name, and the figure on the right.
export function TopListCard({
  title,
  subtitle,
  items,
  emptyText = "Nothing to rank for the current filters.",
  compact = false,
  ranked = true,
}: {
  title: string;
  subtitle?: string;
  items: TopListItem[];
  emptyText?: string;
  // Smaller type and tighter rows, so it fits in a row of four cards.
  compact?: boolean;
  // Number each row and draw a bar relative to the highest (a "top N"); off for a plain list.
  ranked?: boolean;
}) {
  const highest = items.reduce((m, i) => Math.max(m, i.value), 0);
  return (
    <div className="h-full w-full rounded-xl border border-border bg-card p-5 sm:p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</p>
      {subtitle && <p className="mt-0.5 text-[10px] italic leading-tight text-muted-foreground/70">{subtitle}</p>}

      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className={`mt-3 flex flex-col ${compact ? "gap-0" : "gap-1"}`}>
          {items.map((item, index) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={item.onClick}
                disabled={!item.onClick}
                className={`w-full rounded-md px-1 text-left transition-colors enabled:hover:bg-accent/40 disabled:cursor-default ${compact ? "py-1" : "py-1.5"}`}
              >
                <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
                  {ranked && (
                    <span className={`flex shrink-0 items-center justify-center rounded bg-primary/15 font-semibold text-primary ${compact ? "h-4 w-4 text-[10px]" : "h-5 w-5 text-[11px]"}`}>
                      {index + 1}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`break-words font-medium text-foreground ${compact ? "text-xs" : "text-sm"}`}>{item.label}</p>
                    {item.note && <p className={`text-muted-foreground ${compact ? "truncate text-[10px]" : "break-words text-[11px]"}`} title={item.note}>{item.note}</p>}
                  </div>
                  <p className={`shrink-0 font-semibold tabular-nums text-foreground ${compact ? "text-xs" : "text-sm"}`}>{formatMoney(item.value)}</p>
                </div>
                {/* bar relative to the highest, so the gap between ranks is visible at a glance */}
                {ranked && (
                  <div className={`mt-1 h-1 overflow-hidden rounded-full bg-muted ${compact ? "ml-6" : "ml-8"}`}>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${highest > 0 ? (item.value / highest) * 100 : 0}%` }} />
                  </div>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
