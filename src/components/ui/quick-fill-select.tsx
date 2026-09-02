import { useEffect, useRef, useState } from "react";

const MAX_VISIBLE_RESULTS = 30;

// The searchable variant — a type-to-filter text input with a dropdown of
// matches, for a list long enough that scrolling a native <select> to find
// one entry isn't practical (e.g. picking one SARO out of hundreds).
function SearchableQuickFillSelect<T>({
  placeholder, items, getLabel, onPick,
}: {
  placeholder: string;
  items: T[];
  getLabel: (item: T) => string;
  onPick: (item: T) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((item) => getLabel(item).toLowerCase().includes(q)) : items;
  const visible = filtered.slice(0, MAX_VISIBLE_RESULTS);

  const pick = (item: T) => {
    onPick(item);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative mb-1.5">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Enter" && visible.length > 0) { e.preventDefault(); pick(visible[0]); }
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-dashed border-input bg-background px-2 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {visible.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">No matches.</p>
          ) : (
            <>
              {visible.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(item)}
                  className="block w-full text-left px-2.5 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
                >
                  {getLabel(item)}
                </button>
              ))}
              {filtered.length > visible.length && (
                <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground border-t border-border">
                  {filtered.length - visible.length} more — keep typing to narrow it down
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// A stateless "pick to fill" dropdown — always resets to its placeholder
// after firing, so it never has to stay in sync with whatever the user
// types afterward in the (always-editable) manual field(s) it fills.
export function QuickFillSelect<T>({
  placeholder, items, getLabel, onPick, searchable = false,
}: {
  placeholder: string;
  items: T[];
  getLabel: (item: T) => string;
  onPick: (item: T) => void;
  // Opt into the type-to-filter variant above instead of a plain native
  // <select> — off by default so every existing caller keeps its current
  // behavior; only worth turning on for a list long enough that scrolling
  // to find one entry is impractical.
  searchable?: boolean;
}) {
  if (searchable) {
    return <SearchableQuickFillSelect placeholder={placeholder} items={items} getLabel={getLabel} onPick={onPick} />;
  }
  return (
    <select
      value=""
      onChange={(e) => {
        const idx = Number(e.target.value);
        if (!Number.isNaN(idx) && items[idx]) onPick(items[idx]);
        e.target.value = "";
      }}
      className="w-full rounded-md border border-dashed border-input bg-background px-2 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition mb-1.5"
    >
      <option value="">{placeholder}</option>
      {items.map((item, i) => <option key={i} value={i}>{getLabel(item)}</option>)}
    </select>
  );
}
