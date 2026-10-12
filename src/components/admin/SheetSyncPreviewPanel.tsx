import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SheetSyncPreview, SyncRowStatus, SyncTable } from "../../lib/sheetSyncApi";
import { describeRow, PreviewRow } from "../../lib/sheetSyncPreview";

const STATUS_STYLE: Record<SyncRowStatus, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  update: { label: "Will update", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  unchanged: { label: "No change", cls: "bg-muted text-muted-foreground" },
};

const FILTERS: { key: "all" | SyncRowStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "update", label: "Updates" },
  { key: "unchanged", label: "No change" },
];

const formatMoney = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// The review step of "Sync Sheets": every row the sync found, what it would do
// with it, and a checkbox per row — the same idea as Bulk Import's preview.
// Nothing is saved until the user confirms.
export function SheetSyncPreviewPanel({
  table,
  preview,
  included,
  onToggle,
  onToggleMany,
}: {
  table: SyncTable;
  preview: SheetSyncPreview;
  included: Set<number>;
  onToggle: (index: number) => void;
  onToggleMany: (indices: number[], on: boolean) => void;
}) {
  const [filter, setFilter] = useState<"all" | SyncRowStatus>("all");

  const described = useMemo(
    () => preview.rows.map((row, index) => ({ row, index, d: describeRow(table, row as PreviewRow) })),
    [preview.rows, table]
  );
  const counts = useMemo(() => {
    const c: Record<SyncRowStatus, number> = { new: 0, update: 0, unchanged: 0 };
    preview.rows.forEach((r) => { c[(r.sync_status as SyncRowStatus) || "new"] += 1; });
    return c;
  }, [preview.rows]);

  const visible = described.filter(({ row }) => filter === "all" || (row.sync_status || "new") === filter);
  const selectable = visible.filter(({ d }) => !d.blockedReason).map(({ index }) => index);
  const allOn = selectable.length > 0 && selectable.every((i) => included.has(i));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-foreground">{preview.rows.length} row(s) found</span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">{counts.new} new</span>
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">{counts.update} to update</span>
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">{counts.unchanged} unchanged</span>
        <span className="ml-auto text-muted-foreground">{included.size} selected</span>
      </div>

      {preview.sources.some((s) => s.error) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {preview.sources.filter((s) => s.error).map((s) => (
            <p key={s.id}><span className="font-medium">{s.label || s.url}:</span> {s.error}</p>
          ))}
        </div>
      )}

      {preview.warnings.length > 0 && (
        <details className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> {preview.warnings.length} warning(s) — review before confirming
          </summary>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {preview.warnings.map((w, i) => <li key={i} className="break-words">{w}</li>)}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filter === f.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="max-h-[42vh] overflow-y-auto rounded-lg border border-border">
        <label className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-muted/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
          <input type="checkbox" checked={allOn} onChange={() => onToggleMany(selectable, !allOn)} />
          Select all shown ({selectable.length})
        </label>
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nothing in this view.</p>
        ) : (
          visible.map(({ row, index, d }) => {
            const status = STATUS_STYLE[(row.sync_status as SyncRowStatus) || "new"];
            const changed = row.changed_fields?.length ? row.changed_fields.join(", ") : "";
            return (
              <label
                key={index}
                className={`flex items-start gap-3 border-b border-border px-3 py-2.5 text-sm last:border-0 ${d.blockedReason ? "opacity-50" : "cursor-pointer hover:bg-accent/40"}`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={included.has(index)}
                  disabled={!!d.blockedReason}
                  onChange={() => onToggle(index)}
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium text-foreground">{d.title}</p>
                  <p className="break-words text-xs text-muted-foreground">{d.subtitle}</p>
                  {changed && <p className="text-[11px] text-amber-700 dark:text-amber-300">Changes: {changed}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold text-foreground">{formatMoney(d.amount)}</p>
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${d.blockedReason ? "bg-destructive/10 text-destructive" : status.cls}`}>
                    {d.blockedReason || status.label}
                  </span>
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
