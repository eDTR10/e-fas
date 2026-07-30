import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export function SortableHeader({
  label, sortKey, activeKey, direction, onSort, className,
}: {
  label: string;
  sortKey: string;
  activeKey: string | null;
  direction: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSort(sortKey); }}
      className={`flex items-center gap-1 hover:text-foreground transition-colors text-left normal-case ${active ? "text-foreground" : ""} ${className || ""}`}
    >
      {label}
      {active ? (
        direction === "asc" ? <ArrowUp className="w-3 h-3 shrink-0" /> : <ArrowDown className="w-3 h-3 shrink-0" />
      ) : (
        <ArrowUpDown className="w-3 h-3 shrink-0 opacity-40" />
      )}
    </button>
  );
}

export function ColumnFilterInput({
  value, onChange, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "Filter…"}
      className="mt-1 w-full rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-normal normal-case tracking-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
    />
  );
}

// Header cell combining both — the common case, so pages don't repeat the
// two-line stack markup everywhere.
export function SortFilterHeader({
  label, sortKey, activeKey, direction, onSort, filterValue, onFilterChange, filterPlaceholder,
}: {
  label: string;
  sortKey: string;
  activeKey: string | null;
  direction: "asc" | "desc";
  onSort: (key: string) => void;
  filterValue: string;
  onFilterChange: (v: string) => void;
  filterPlaceholder?: string;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <SortableHeader label={label} sortKey={sortKey} activeKey={activeKey} direction={direction} onSort={onSort} />
      <ColumnFilterInput value={filterValue} onChange={onFilterChange} placeholder={filterPlaceholder} />
    </div>
  );
}
