import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// One KPI card — mirrors the Dashboard's stat-card markup exactly so a KPI
// strip on a list page reads as the same design system, not a foreign widget.
export interface KpiCardData {
  title: string;
  value: string;
  // Small reference line directly under the title (e.g. which sheet column a figure comes from).
  subtitle?: string;
  caption?: string;
  captionTone?: "muted" | "warning";
  icon: LucideIcon;
  onClick?: () => void;
}

export default function KpiStrip({ cards, leading, trailing, gridClassName }: {
  cards: KpiCardData[];
  // An extra card shown first, in the same row as the KPI cards (e.g. a "by linked sheet" breakdown).
  leading?: ReactNode;
  // An extra card shown last, in the same row.
  trailing?: ReactNode;
  // Replaces the default self-fitting column rule (e.g. a fixed 4-column row that drops to 2 and 1).
  gridClassName?: string;
}) {
  if (cards.length === 0 && !leading && !trailing) return null;
  return (
    <div className={`grid ${gridClassName || "grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))]"} gap-x-4 mb-2`}>
      {leading && <div className="mb-4 flex [grid-row:span_3]">{leading}</div>}
      {cards.map((card) => {
        const Icon = card.icon;
        const clickable = !!card.onClick;
        return (
          <div
            key={card.title}
            onClick={card.onClick}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.onClick!(); } } : undefined}
            className={`bg-card border border-border rounded-xl p-5 mb-4 grid [grid-row:span_3] [grid-template-rows:subgrid] sm:p-4 hover:border-primary/40 transition-colors ${clickable ? "cursor-pointer" : ""}`}
          >
            <div className="flex items-start justify-between gap-2 pb-3 sm:pb-1.5">
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground uppercase tracking-wide">{card.title}</p>
                {card.subtitle && (
                  <p className="mt-0.5 text-[10px] italic leading-tight text-muted-foreground/70">{card.subtitle}</p>
                )}
              </div>
              <span className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 sm:p-1.5">
                <Icon className="w-5 h-5 sm:w-4 sm:h-4" />
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground break-words sm:text-xl">{card.value}</p>
            {card.caption && (
              <p className={`pt-3 text-xs font-medium sm:pt-1.5 ${card.captionTone === "warning" ? "text-destructive" : "text-foreground"}`}>
                {card.caption}
              </p>
            )}
          </div>
        );
      })}
      {trailing && <div className="mb-4 flex [grid-row:span_3]">{trailing}</div>}
    </div>
  );
}
