import { Input } from "../ui/input";
import { Quarter } from "../../lib/useDateRangeFilter";

const QUARTERS = ["all", "1", "2", "3", "4"] as const;

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

      <div className="flex gap-1">
        {QUARTERS.map((q) => (
          <button
            key={q}
            onClick={() => onQuarterChange(q)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              quarter === q ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground"
            }`}
          >
            {q === "all" ? "All" : `Q${q}`}
          </button>
        ))}
      </div>

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
