import type { LucideIcon } from "lucide-react";

// One KPI card — mirrors the Dashboard's stat-card markup exactly so a KPI
// strip on a list page reads as the same design system, not a foreign widget.
export interface KpiCardData {
  title: string;
  value: string;
  caption?: string;
  captionTone?: "muted" | "warning";
  icon: LucideIcon;
  onClick?: () => void;
}

export default function KpiStrip({ cards }: { cards: KpiCardData[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="grid grid-cols-4 gap-4 mb-6 sm:grid-cols-1">
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
            className={`bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary/40 transition-colors ${clickable ? "cursor-pointer" : ""}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{card.title}</p>
              <span className="p-2 rounded-lg bg-primary/10 text-primary">
                <Icon className="w-5 h-5" />
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">{card.value}</p>
            {card.caption && (
              <p className={`text-xs font-medium ${card.captionTone === "warning" ? "text-destructive" : "text-muted-foreground"}`}>
                {card.caption}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
