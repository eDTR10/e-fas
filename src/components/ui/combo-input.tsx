import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 40;

// A text field with a searchable list of suggestions underneath it. Typing
// filters the list; clicking a suggestion fills the field; anything typed that
// isn't in the list is kept as-is — for values that are usually reused but
// sometimes new (e.g. a SARO's Purpose).
export function ComboInput({
  value,
  onChange,
  options,
  placeholder,
  className,
  emptyHint = "No matches — what you typed will be used.",
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const q = value.trim().toLowerCase();
  // Every word typed must appear somewhere in the option, in any order.
  const matches = useMemo(() => {
    const words = q.split(/\s+/).filter(Boolean);
    const list = words.length ? options.filter((o) => words.every((w) => o.toLowerCase().includes(w))) : options;
    return list.slice(0, MAX_VISIBLE);
  }, [options, q]);

  useEffect(() => setActive(0), [q]);

  const pick = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); pick(matches[active]); }
            else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
          }}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-16 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-muted-foreground">
          {value && (
            <button type="button" aria-label="Clear" onClick={() => { onChange(""); setOpen(true); }} className="rounded p-0.5 hover:bg-accent hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" aria-label="Show suggestions" tabIndex={-1} onClick={() => setOpen((o) => !o)} className="rounded p-0.5 hover:bg-accent hover:text-foreground">
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{emptyHint}</p>
          ) : (
            matches.map((o, i) => (
              <button
                key={o}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "block w-full px-3 py-2 text-left text-xs text-foreground",
                  i === active ? "bg-accent" : "hover:bg-accent/60"
                )}
              >
                <span className="line-clamp-2 break-words">{o}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
