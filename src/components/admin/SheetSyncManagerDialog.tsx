import { isCancelledRequest, OPERATION_CANCELLED_MESSAGE } from "../../lib/operationProgress";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { sheetSyncApi, SheetSyncPreview, SheetSyncSource, SyncTable } from "../../lib/sheetSyncApi";
import { confirmPreviewRows, PreviewRow, supportsSyncPreview } from "../../lib/sheetSyncPreview";
import { SheetSyncPreviewPanel } from "./SheetSyncPreviewPanel";

interface SyncSummary {
  hasIssues: boolean;
  counts: string[];
  failedSources: {
    id: number;
    label: string;
    url: string;
    error: string | null;
  }[];
  warningCount: number;
  warnings: { source: string; message: string }[];
}

// Year is picked, never typed — a fixed list from a few years back up to
// next year (plus whatever year is already stored, if it falls outside).
function YearSelect({
  value,
  onChange,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const thisYear = new Date().getFullYear();
  const years = new Set<number>();
  for (let y = thisYear + 1; y >= thisYear - 6; y--) years.add(y);
  if (value) years.add(Number(value));
  const sorted = Array.from(years).sort((a, b) => b - a);
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label="Year"
      className={`h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <option value="">Year</option>
      {sorted.map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
    </select>
  );
}

interface PendingRemoval {
  source: SheetSyncSource;
  table: SyncTable;
}

// An API server that predates the Year field silently ignores it, so a save
// "succeeds" but the year comes back empty — surface that instead of
// leaving the sheet looking like it has no year for no apparent reason.
function assertYearSaved(table: SyncTable, wanted: number | undefined, saved: SheetSyncSource) {
  if (table === "received_saro" && wanted !== undefined && saved.year !== wanted) {
    throw new Error(
      "The server didn't save the year — the API it's connected to hasn't been updated with the Year field yet (backend deploy + migration needed)."
    );
  }
}

function extractError(err: unknown): string {
  if (isCancelledRequest(err)) return OPERATION_CANCELLED_MESSAGE;
  const error = err as {
    code?: string;
    message?: string;
    response?: { data?: Record<string, unknown> | string };
  };
  const data = error?.response?.data;
  if (!data) {
    return error?.code === "ERR_NETWORK"
      ? "Cannot reach the eFAS API server. Check that the backend is running and connected, then try again."
      : error?.message || "The sync request failed before the server responded.";
  }
  if (typeof data === "string") return data.slice(0, 500);
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(" ") : String(value)}`)
    .join(" | ");
}

// A sync attempt against a table with no sources configured yet is not a
// failure worth surfacing — the secondary (e.g. Net/Acctg) section is
// optional, so a user who hasn't set it up shouldn't see an error just
// because the primary section's sync went ahead without it.
function isUnconfiguredError(err: unknown): boolean {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return Boolean(detail?.includes("No sheet URLs configured"));
}

const formatDateTime = (value: string | null): string => {
  if (!value) return "Never synced";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

// One table's list of configured sheets, plus its own "add a sheet" form.
// Rendered once for the primary table and, when the dialog is configured
// with one, again for the secondary table — so e.g. Disbursement Tracker's
// own DV sheet and its separate Net (Acctg) sheet can both be managed from
// the same dialog instead of needing two. Exported so other dialogs that
// need this exact multi-source add/remove UI — but not the generic
// immediate-write "Sync Now" this dialog also provides, e.g.
// CustomDisbursementSheetSetupDialog, whose actual sync is a separate
// client-side-preview flow — can reuse it directly instead of duplicating
// this list/add/remove markup.
export function SourceListSection({
  label,
  sources,
  loading,
  busy,
  onAdd,
  onRequestRemove,
  onUpdate,
  showYear = false,
}: {
  label: string;
  sources: SheetSyncSource[];
  loading: boolean;
  busy: boolean;
  onAdd: (label: string, url: string, year?: number) => Promise<void>;
  onRequestRemove: (source: SheetSyncSource) => void;
  // When provided, each configured sheet gets an edit (pencil) button that
  // lets its label, URL and — with showYear — year be changed in place.
  onUpdate?: (source: SheetSyncSource, changes: { label: string; url: string; year?: number }) => Promise<void>;
  // Ask which year each added sheet covers (Received SARO only) — see
  // SheetSyncSource.year.
  showYear?: boolean;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newYear, setNewYear] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editYear, setEditYear] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = (source: SheetSyncSource) => {
    setError(null);
    setEditingId(source.id);
    setEditLabel(source.label);
    setEditUrl(source.url);
    setEditYear(source.year ? String(source.year) : "");
  };

  const handleSave = async (source: SheetSyncSource) => {
    if (!onUpdate) return;
    if (!editUrl.trim()) {
      setError("The Google Sheet URL can't be empty.");
      return;
    }
    const yearNumber = Number(editYear);
    if (showYear && !(Number.isInteger(yearNumber) && yearNumber >= 2000 && yearNumber <= 2100)) {
      setError("Pick the year this sheet covers.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onUpdate(source, { label: editLabel.trim(), url: editUrl.trim(), year: showYear ? yearNumber : undefined });
      setEditingId(null);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newUrl.trim()) {
      setError("Paste a Google Sheet URL first.");
      return;
    }
    const yearNumber = Number(newYear);
    if (showYear && !(Number.isInteger(yearNumber) && yearNumber >= 2000 && yearNumber <= 2100)) {
      setError("Pick the year this sheet covers.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await onAdd(newLabel.trim(), newUrl.trim(), showYear ? yearNumber : undefined);
      setNewLabel("");
      setNewUrl("");
      setNewYear("");
    } catch (err) {
      setError(extractError(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-foreground">{label}</p>

      {loading ? (
        <div className="space-y-2" aria-label={`Loading configured sheets for ${label}`}>
          <div className="h-14 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-4 text-center">
          <Link2 className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-xs font-medium text-foreground">No sheets configured yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sources.map((source) => editingId === source.id ? (
            <div
              key={source.id}
              className="flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2.5 text-xs sm:flex-col sm:items-stretch"
            >
              <Input
                placeholder="Label (optional)"
                value={editLabel}
                onChange={(event) => setEditLabel(event.target.value)}
                className="h-9 max-w-[170px] text-xs sm:max-w-none"
                disabled={saving}
              />
              {showYear && (
                <YearSelect
                  value={editYear}
                  onChange={setEditYear}
                  className="w-24 shrink-0 sm:w-full"
                  disabled={saving}
                />
              )}
              <Input
                placeholder="Google Sheet URL…"
                value={editUrl}
                onChange={(event) => setEditUrl(event.target.value)}
                className="h-9 flex-1 text-xs"
                disabled={saving}
              />
              <Button size="sm" className="shrink-0" onClick={() => handleSave(source)} disabled={saving}>
                {saving ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-foreground"
                onClick={() => { setEditingId(null); setError(null); }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div
              key={source.id}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs"
            >
              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {source.label || "(untitled sheet)"}
                  {showYear && (
                    <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {source.year ?? "No year"}
                    </span>
                  )}
                </p>
                <p className="truncate text-muted-foreground">{source.url}</p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground sm:hidden">
                {formatDateTime(source.last_synced_at)}
              </span>
              {onUpdate && (
                <button
                  type="button"
                  onClick={() => startEdit(source)}
                  disabled={busy || editingId !== null}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  aria-label={`Edit ${source.label || "sheet"}`}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onRequestRemove(source)}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Remove ${source.label || "sheet"}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 sm:flex-col sm:items-stretch">
        <Input
          placeholder="Label (optional)"
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
          className="h-9 max-w-[170px] text-xs sm:max-w-none"
          disabled={adding || busy}
        />
        {showYear && (
          <YearSelect
            value={newYear}
            onChange={setNewYear}
            className="w-24 shrink-0 sm:w-full"
            disabled={adding || busy}
          />
        )}
        <Input
          placeholder="Paste Google Sheet URL…"
          value={newUrl}
          onChange={(event) => setNewUrl(event.target.value)}
          className="h-9 flex-1 text-xs"
          disabled={adding || busy}
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 text-foreground"
          onClick={handleAdd}
          disabled={adding || busy}
        >
          {adding ? (
            <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1 h-3.5 w-3.5" />
          )}
          {adding ? "Adding…" : "Add"}
        </Button>
      </div>
    </div>
  );
}

export function SheetSyncManagerDialog({
  open,
  onOpenChange,
  table,
  label,
  secondaryTable,
  secondaryLabel,
  onSynced,
  autoPreview = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: SyncTable;
  label: string;
  // When set, a second section for a separate table's sources is rendered
  // in the same dialog (e.g. Disbursement Tracker's own DV sheet alongside
  // its Net/Acctg sheet), and "Sync Now" syncs both — one place to
  // configure and sync everything this table draws from.
  secondaryTable?: SyncTable;
  secondaryLabel?: string;
  onSynced?: () => void;
  // Start the sync preview as soon as the dialog opens (used by each page's
  // "Sync Sheets" button, so it lands straight on the review step).
  autoPreview?: boolean;
}) {
  const [sources, setSources] = useState<SheetSyncSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [secondarySources, setSecondarySources] = useState<SheetSyncSource[]>([]);
  // Only starts "loading" when there's actually a secondary table to fetch
  // — most callers (e.g. RAOD) don't pass one at all, and loadSecondary()
  // below returns immediately without ever clearing this, so starting it
  // at `true` unconditionally left "Sync Now" permanently disabled
  // (disabled={... || secondaryLoading}) for every table without one.
  const [secondaryLoading, setSecondaryLoading] = useState(!!secondaryTable);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  // Review step: what a sync WOULD do, with a checkbox per row. Nothing is saved until confirmed.
  const [preview, setPreview] = useState<SheetSyncPreview | null>(null);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const autoStarted = useRef(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const loadPrimary = async () => {
    setLoading(true);
    try {
      setSources(await sheetSyncApi.list(table));
    } finally {
      setLoading(false);
    }
  };

  const loadSecondary = async () => {
    if (!secondaryTable) { setSecondaryLoading(false); return; }
    setSecondaryLoading(true);
    try {
      setSecondarySources(await sheetSyncApi.list(secondaryTable));
    } finally {
      setSecondaryLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setError(null);
      setSyncSummary(null);
      setPreview(null);
      setIncluded(new Set());
      setPendingRemoval(null);
      setRemoveError(null);
      loadPrimary();
      loadSecondary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, table, secondaryTable]);

  const requestRemove = (source: SheetSyncSource, sourceTable: SyncTable) => {
    setRemoveError(null);
    setPendingRemoval({ source, table: sourceTable });
  };

  const handleRemove = async () => {
    if (!pendingRemoval) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await sheetSyncApi.remove(pendingRemoval.source.id);
      const removedTable = pendingRemoval.table;
      setPendingRemoval(null);
      if (removedTable === table) await loadPrimary();
      else await loadSecondary();
    } catch (err) {
      setRemoveError(extractError(err));
    } finally {
      setRemoving(false);
    }
  };

  const handleSync = async () => {
    if (sources.length === 0 && (!secondaryTable || secondarySources.length === 0)) {
      setError(`Add at least one Google Sheet URL before syncing.`);
      return;
    }

    setSyncing(true);
    setSyncSummary(null);
    setError(null);

    // Same flow as Bulk Import: look first, save only what the user confirms.
    if (supportsSyncPreview(table) && sources.length > 0) {
      try {
        const result = await sheetSyncApi.preview(table);
        setPreview(result);
        setIncluded(new Set(
          result.rows
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => (row.sync_status || "new") !== "unchanged" && !row.missing_required && !row.error)
            .map(({ index }) => index)
        ));
      } catch (err) {
        setError(extractError(err));
      } finally {
        setSyncing(false);
      }
      return;
    }

    try {
      const counts: string[] = [];
      const failedSources: SyncSummary["failedSources"] = [];
      let warningCount = 0;
      const warnings: SyncSummary["warnings"] = [];

      if (sources.length > 0) {
        const result = await sheetSyncApi.sync(table);
        failedSources.push(...result.sources.filter((s) => s.error));
        const r = result.result;
        if (r.created !== undefined) counts.push(`${r.created} created`);
        if (r.updated !== undefined) counts.push(`${r.updated} updated`);
        if (r.linked !== undefined) counts.push(`${r.linked} linked`);
        if (r.cluster_updated) counts.push(`${r.cluster_updated} assigned to MDS Regular`);
        warningCount += result.warnings.length;
        warnings.push(...result.warnings.map((message) => ({ source: label, message })));
      }

      if (secondaryTable && secondarySources.length > 0) {
        try {
          const secondaryResult = await sheetSyncApi.sync(secondaryTable);
          failedSources.push(...secondaryResult.sources.filter((s) => s.error));
          if (secondaryResult.result.updated !== undefined) {
            counts.push(`${secondaryResult.result.updated} ${secondaryLabel || "secondary"} value(s) updated`);
          }
          warningCount += secondaryResult.warnings.length;
          warnings.push(
            ...secondaryResult.warnings.map((message) => ({
              source: secondaryLabel || secondaryTable,
              message,
            })),
          );
        } catch (err) {
          if (!isUnconfiguredError(err)) throw err;
        }
      }

      setSyncSummary({
        hasIssues: failedSources.length > 0 || warningCount > 0,
        counts,
        failedSources,
        warningCount,
        warnings,
      });
      await loadPrimary();
      await loadSecondary();
      onSynced?.();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSyncing(false);
    }
  };

  // Writes the ticked rows through the table's normal bulk import (with upsert),
  // then runs the optional secondary (Net/Acctg) pass the old one-click sync did.
  const handleConfirmPreview = async () => {
    if (!preview) return;
    setConfirming(true);
    setError(null);
    try {
      const rows = preview.rows.filter((_, i) => included.has(i)) as unknown as PreviewRow[];
      const failedSources = preview.sources.filter((s) => s.error);
      const counts: string[] = [];
      if (rows.length > 0) {
        const result = await confirmPreviewRows(table, rows);
        counts.push(`${result.created} created`, `${result.updated} updated`);
        await sheetSyncApi.markSynced(table);
      } else {
        counts.push("Nothing selected — no rows were saved");
      }

      let secondaryWarnings: string[] = [];
      if (secondaryTable && secondarySources.length > 0) {
        try {
          const secondaryResult = await sheetSyncApi.sync(secondaryTable);
          failedSources.push(...secondaryResult.sources.filter((s) => s.error));
          if (secondaryResult.result.updated !== undefined) {
            counts.push(`${secondaryResult.result.updated} ${secondaryLabel || "secondary"} value(s) updated`);
          }
          secondaryWarnings = secondaryResult.warnings;
        } catch (err) {
          if (!isUnconfiguredError(err)) throw err;
        }
      }

      const warnings = [
        ...preview.warnings.map((message) => ({ source: label, message })),
        ...secondaryWarnings.map((message) => ({ source: secondaryLabel || secondaryTable || "", message })),
      ];
      setSyncSummary({
        hasIssues: failedSources.length > 0 || warnings.length > 0,
        counts,
        failedSources,
        warningCount: warnings.length,
        warnings,
      });
      setPreview(null);
      setIncluded(new Set());
      await loadPrimary();
      await loadSecondary();
      onSynced?.();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setConfirming(false);
    }
  };

  // Opened from a page's "Sync Sheets" button: go straight to the review step.
  useEffect(() => {
    if (!open) { autoStarted.current = false; return; }
    if (autoPreview && !autoStarted.current && !loading && !secondaryLoading) {
      autoStarted.current = true;
      if (sources.length > 0) void handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoPreview, loading, secondaryLoading, sources.length]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (syncing || confirming || pendingRemoval)) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Sheet Setup — {label}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
          {preview ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Review what this sync would do to {label}. New rows and changes are ticked; rows that already match the
              sheet are not. Nothing is saved until you press Confirm.
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Add Google Sheet URLs, then sync their rows into {label}. You review the rows first, the same as Bulk
              Import, before anything is saved. Multiple sheets are merged when they use the same column headers.
            </p>
          )}

          {preview && (
            <SheetSyncPreviewPanel
              table={table}
              preview={preview}
              included={included}
              onToggle={(index) => setIncluded((prev) => {
                const next = new Set(prev);
                if (next.has(index)) next.delete(index); else next.add(index);
                return next;
              })}
              onToggleMany={(indices, on) => setIncluded((prev) => {
                const next = new Set(prev);
                indices.forEach((i) => (on ? next.add(i) : next.delete(i)));
                return next;
              })}
            />
          )}

          {!preview && syncSummary && (
            <section
              className={`rounded-xl border p-4 ${
                syncSummary.hasIssues
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-emerald-500/30 bg-emerald-500/10"
              }`}
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 rounded-full p-2 ${
                    syncSummary.hasIssues
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {syncSummary.hasIssues ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {syncSummary.hasIssues ? "Sync completed with issues" : "Sync complete"}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {syncSummary.counts.length > 0
                      ? syncSummary.counts.join(" · ")
                      : "The sheets were already up to date."}
                  </p>

                  {syncSummary.failedSources.length > 0 && (
                    <div className="mt-3 rounded-lg border border-destructive/20 bg-background/70 px-3 py-2">
                      <p className="text-xs font-medium text-destructive">
                        {syncSummary.failedSources.length} sheet
                        {syncSummary.failedSources.length === 1 ? "" : "s"} could not be synced
                      </p>
                      <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                        {syncSummary.failedSources.map((source) => (
                          <li key={source.id}>
                            <span className="font-medium text-foreground">
                              {source.label || source.url}:
                            </span>{" "}
                            {source.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {syncSummary.warningCount > 0 && (
                    <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                      {syncSummary.warningCount} warning
                      {syncSummary.warningCount === 1 ? "" : "s"} found. Review the imported
                      rows before continuing.
                    </p>
                  )}

                  {syncSummary.warnings.length > 0 && (
                    <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-amber-500/20 bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
                      {syncSummary.warnings.map((warning, index) => (
                        <li key={index} className="flex gap-2">
                          <span className="shrink-0 font-medium text-amber-700 dark:text-amber-300">
                            {index + 1}.
                          </span>
                          <span className="min-w-0 break-words">{warning.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          )}

          {error && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className={preview ? "hidden" : "flex flex-col gap-5"}>
          <SourceListSection
            label={label}
            sources={sources}
            loading={loading}
            busy={syncing}
            showYear={table === "received_saro"}
            onUpdate={async (source, changes) => {
              const saved = await sheetSyncApi.update(source.id, changes);
              await loadPrimary();
              assertYearSaved(table, changes.year, saved);
            }}
            onAdd={async (newLabel, newUrl, newYear) => {
              const saved = await sheetSyncApi.create({ table, label: newLabel, url: newUrl, order: sources.length, year: newYear });
              await loadPrimary();
              assertYearSaved(table, newYear, saved);
            }}
            onRequestRemove={(source) => requestRemove(source, table)}
          />

          {secondaryTable && (
            <>
              <div className="border-t border-border" />
              <SourceListSection
                label={secondaryLabel || secondaryTable}
                sources={secondarySources}
                loading={secondaryLoading}
                busy={syncing}
                onAdd={async (newLabel, newUrl) => {
                  await sheetSyncApi.create({
                    table: secondaryTable, label: newLabel, url: newUrl, order: secondarySources.length,
                  });
                  await loadSecondary();
                }}
                onRequestRemove={(source) => requestRemove(source, secondaryTable)}
                onUpdate={async (source, changes) => {
                  await sheetSyncApi.update(source.id, changes);
                  await loadSecondary();
                }}
              />
            </>
          )}
          </div>
        </div>

        {preview ? (
          <DialogFooter className="border-t border-border justify-end gap-2">
            <Button variant="outline" className="text-foreground" onClick={() => { setPreview(null); setIncluded(new Set()); }} disabled={confirming}>
              Back
            </Button>
            <Button onClick={handleConfirmPreview} disabled={confirming || included.size === 0}>
              {confirming ? "Saving…" : `Confirm sync (${included.size})`}
            </Button>
          </DialogFooter>
        ) : (
        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button
            variant={syncSummary ? "default" : "outline"}
            className={syncSummary ? "" : "text-foreground"}
            onClick={() => handleOpenChange(false)}
            disabled={syncing}
          >
            {syncSummary ? "Done" : "Close"}
          </Button>
          <Button onClick={handleSync} disabled={syncing || loading || secondaryLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Checking sheet…" : syncSummary ? "Sync Again" : supportsSyncPreview(table) ? "Check Sync" : "Sync Now"}
          </Button>
        </DialogFooter>
        )}

        {pendingRemoval && (
          <div
            className="pointer-events-auto absolute inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !removing) {
                setPendingRemoval(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !removing) {
                event.preventDefault();
                event.stopPropagation();
                setPendingRemoval(null);
              }
            }}
          >
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="remove-sheet-title"
              aria-describedby="remove-sheet-description"
              className="relative w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl"
            >
              <button
                type="button"
                className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                onClick={() => setPendingRemoval(null)}
                disabled={removing}
                aria-label="Close confirmation"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0 pr-5">
                  <h2 id="remove-sheet-title" className="text-lg font-semibold text-foreground">
                    Remove “{pendingRemoval.source.label || "this sheet"}”?
                  </h2>
                  <p
                    id="remove-sheet-description"
                    className="mt-2 text-sm leading-relaxed text-muted-foreground"
                  >
                    This stops future syncing from this source. Records that were already
                    imported will not be deleted.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="truncate text-xs font-medium text-foreground">
                  {pendingRemoval.source.label || "(untitled sheet)"}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {pendingRemoval.source.url}
                </p>
              </div>

              {removeError && (
                <div
                  className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  role="alert"
                >
                  {removeError}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="text-foreground"
                  onClick={() => setPendingRemoval(null)}
                  disabled={removing}
                  autoFocus
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleRemove} disabled={removing}>
                  {removing ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  {removing ? "Removing…" : "Remove sheet"}
                </Button>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
