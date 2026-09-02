import { ChevronDown } from "lucide-react";
import { Input } from "../ui/input";
import { useDropdown } from "../../lib/useDropdown";
import { Quarter } from "../../lib/useDateRangeFilter";

const QUARTERS = ["all", "1", "2", "3", "4"] as const;
const QUARTER_LABELS: Record<(typeof QUARTERS)[number], string> = {
  all: "All Quarters", "1": "Q1", "2": "Q2", "3": "Q3", "4": "Q4",
};

// Single-select — picking a quarter narrows dateFrom/dateTo to that one
// range (see useDateRangeFilter), so unlike NtcaBalancePage's quarter
// COLUMN picker (which shows/hides several at once, same underlying data)
// this can only ever mean one quarter at a time. Built on the same
// useDropdown plumbing as that one, picking here just also closes the
// panel instead of leaving it open for further toggling.
function QuarterPicker({ quarter, onChange }: { quarter: Quarter; onChange: (q: Quarter) => void }) {
  const { open, setOpen, containerRef } = useDropdown<HTMLDivElement>();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {QUARTER_LABELS[quarter]}
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-28 rounded-lg border border-border bg-popover shadow-lg py-1">
          {QUARTERS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => { onChange(q); setOpen(false); }}
              className={`block w-full text-left px-2.5 py-1.5 text-xs transition-colors ${
                quarter === q ? "text-primary font-medium bg-primary/10" : "text-foreground hover:bg-accent"
              }`}
            >
              {QUARTER_LABELS[q]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The date-range control shared by every page that filters records by
// date — Year / Q1-Q4 quick-select / explicit From-To. Extra page-specific
// filter controls (PAP, SARO, etc.) render after it via `children`, all in
// the same single filter row above whatever they scope.
export default function DateRangeFilterBar({
  year, quarter, dateFrom, dateTo, availableYears,
  onYearChange, onQuarterChange, onDateFromChange, onDateToChange,
  onClear, hasActiveFilters, children,
}: {
  year: string;
  quarter: Quarter;
  dateFrom: string;
  dateTo: string;
  availableYears: number[];
  onYearChange: (y: string) => void;
  onQuarterChange: (q: Quarter) => void;
  onDateFromChange: (d: string) => void;
  onDateToChange: (d: string) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 bg-card border border-border rounded-xl p-3">
      <select
        value={year}
        onChange={(e) => onYearChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="all">All Years</option>
        {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>

      <QuarterPicker quarter={quarter} onChange={onQuarterChange} />

      <Input type="date" className="h-8 w-36 text-xs" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} />
      <span className="text-xs text-muted-foreground">to</span>
      <Input type="date" className="h-8 w-36 text-xs" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} />

      {children}

      {hasActiveFilters && (
        <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground underline ml-auto">
          Clear filters
        </button>
      )}
    </div>
  );
}
