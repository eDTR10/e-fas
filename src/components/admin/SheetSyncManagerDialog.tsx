import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
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
import { sheetSyncApi, SheetSyncSource, SyncTable } from "../../lib/sheetSyncApi";

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
}

function extractError(err: unknown): string {
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

const formatDateTime = (value: string | null): string => {
  if (!value) return "Never synced";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export function SheetSyncManagerDialog({
  open,
  onOpenChange,
  table,
  label,
  onSynced,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: SyncTable;
  label: string;
  onSynced?: () => void;
}) {
  const [sources, setSources] = useState<SheetSyncSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [sourceToRemove, setSourceToRemove] = useState<SheetSyncSource | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setSources(await sheetSyncApi.list(table));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setError(null);
      setSyncSummary(null);
      setSourceToRemove(null);
      setRemoveError(null);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, table]);

  const handleAdd = async () => {
    if (!newUrl.trim()) {
      setError("Paste a Google Sheet URL first.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await sheetSyncApi.create({
        table,
        label: newLabel.trim(),
        url: newUrl.trim(),
        order: sources.length,
      });
      setNewLabel("");
      setNewUrl("");
      await load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setAdding(false);
    }
  };

  const requestRemove = (source: SheetSyncSource) => {
    setRemoveError(null);
    setSourceToRemove(source);
  };

  const handleRemove = async () => {
    if (!sourceToRemove) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await sheetSyncApi.remove(sourceToRemove.id);
      setSourceToRemove(null);
      await load();
    } catch (err) {
      setRemoveError(extractError(err));
    } finally {
      setRemoving(false);
    }
  };

  const handleSync = async () => {
    if (sources.length === 0) {
      setError(`Add at least one Google Sheet URL for ${label} before syncing.`);
      return;
    }

    setSyncing(true);
    setSyncSummary(null);
    setError(null);

    try {
      const result = await sheetSyncApi.sync(table);
      const failedSources = result.sources.filter((source) => source.error);
      const syncResult = result.result;
      const counts = [
        syncResult.created !== undefined ? `${syncResult.created} created` : null,
        syncResult.updated !== undefined ? `${syncResult.updated} updated` : null,
        syncResult.linked !== undefined ? `${syncResult.linked} linked` : null,
        syncResult.cluster_updated
          ? `${syncResult.cluster_updated} assigned to MDS Regular`
          : null,
      ].filter((count): count is string => Boolean(count));

      setSyncSummary({
        hasIssues: failedSources.length > 0 || result.warnings.length > 0,
        counts,
        failedSources,
        warningCount: result.warnings.length,
      });
      await load();
      onSynced?.();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (syncing || adding || removing || sourceToRemove)) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Sheet Setup — {label}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Add Google Sheet URLs, then sync their rows directly into {label}.
            Multiple sheets are merged when they use the same column headers.
          </p>

          {syncSummary && (
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
                </div>
              </div>
            </section>
          )}

          {loading ? (
            <div className="space-y-2" aria-label="Loading configured sheets">
              <div className="h-14 animate-pulse rounded-lg bg-muted" />
              <div className="h-14 animate-pulse rounded-lg bg-muted" />
            </div>
          ) : sources.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-center">
              <Link2 className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-xs font-medium text-foreground">No sheets configured yet</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Add your first Google Sheet below.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs"
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {source.label || "(untitled sheet)"}
                    </p>
                    <p className="truncate text-muted-foreground">{source.url}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDateTime(source.last_synced_at)}
                  </span>
                  <button
                    type="button"
                    onClick={() => requestRemove(source)}
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
              disabled={adding || syncing}
            />
            <Input
              placeholder="Paste Google Sheet URL…"
              value={newUrl}
              onChange={(event) => setNewUrl(event.target.value)}
              className="h-9 flex-1 text-xs"
              disabled={adding || syncing}
            />
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-foreground"
              onClick={handleAdd}
              disabled={adding || syncing}
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

        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button
            variant={syncSummary ? "default" : "outline"}
            className={syncSummary ? "" : "text-foreground"}
            onClick={() => handleOpenChange(false)}
            disabled={syncing || adding}
          >
            {syncSummary ? "Done" : "Close"}
          </Button>
          <Button onClick={handleSync} disabled={syncing || adding || loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : syncSummary ? "Sync Again" : "Sync Now"}
          </Button>
        </DialogFooter>

        {sourceToRemove && (
          <div
            className="pointer-events-auto absolute inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !removing) {
                setSourceToRemove(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !removing) {
                event.preventDefault();
                event.stopPropagation();
                setSourceToRemove(null);
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
                onClick={() => setSourceToRemove(null)}
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
                    Remove “{sourceToRemove.label || "this sheet"}”?
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
                  {sourceToRemove.label || "(untitled sheet)"}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {sourceToRemove.url}
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
                  onClick={() => setSourceToRemove(null)}
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
