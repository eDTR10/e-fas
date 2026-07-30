import { useEffect, useState } from "react";
import { Plus, Trash2, RefreshCw, Link2 } from "lucide-react";
import Swal from "sweetalert2";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import { sheetSyncApi, SheetSyncSource, SyncTable } from "../../lib/sheetSyncApi";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

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
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ");
}

const formatDateTime = (value: string | null): string => {
  if (!value) return "Never synced";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
};

// Lets a single table's own screen manage its Google Sheet URLs directly
// (add/remove, plus Sync Now) instead of going to Settings for it — this
// was moved out of the old centralized "Table Sync" section in Settings,
// which listed every table's sources in one place. Multiple sheets can
// still feed the same table (e.g. one per office); syncing merges every
// configured source's rows into one combined import.
export function SheetSyncManagerDialog({
  open, onOpenChange, table, label, onSynced,
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
      await sheetSyncApi.create({ table, label: newLabel.trim(), url: newUrl.trim(), order: sources.length });
      setNewLabel("");
      setNewUrl("");
      load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (source: SheetSyncSource) => {
    const result = await Swal.fire({
      icon: "warning", title: `Remove "${source.label || source.url}"?`,
      text: "This only stops syncing from it — it doesn't undo anything already imported.",
      showCancelButton: true, confirmButtonText: "Remove", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await sheetSyncApi.remove(source.id);
    load();
  };

  const handleSync = async () => {
    if (sources.length === 0) {
      Swal.fire({ icon: "info", title: "No sheets configured", text: `Add at least one Google Sheet URL for ${label} first.`, ...swalTheme });
      return;
    }
    setSyncing(true);
    try {
      const result = await sheetSyncApi.sync(table);
      const failedSources = result.sources.filter((s) => s.error);
      const r = result.result;
      const counts = [
        r.created !== undefined ? `${r.created} created` : null,
        r.updated !== undefined ? `${r.updated} updated` : null,
        r.linked !== undefined ? `${r.linked} linked` : null,
        r.cluster_updated ? `${r.cluster_updated} assigned to MDS Regular` : null,
      ].filter(Boolean).join(", ");

      await Swal.fire({
        icon: failedSources.length > 0 ? "warning" : "success",
        title: "Sync complete",
        html: `
          <p style="margin-bottom:8px">${counts || "Nothing new."}</p>
          ${failedSources.length > 0
            ? `<p style="color:#dc2626;font-size:13px">${failedSources.length} sheet(s) failed:</p><ul style="text-align:left;font-size:12px">${failedSources.map((s) => `<li>${s.label || s.url}: ${s.error}</li>`).join("")}</ul>`
            : ""}
          ${result.warnings.length > 0
            ? `<p style="font-size:12px;margin-top:8px">${result.warnings.length} warning(s) — check the affected rows.</p>`
            : ""}
        `,
        ...swalTheme,
      });
      load();
      onSynced?.();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Sync failed", text: extractError(err), ...swalTheme });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Sheet Setup — {label}</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Drop in a Google Sheet's URL (shared as "Anyone with the link can view", or with the configured service account), then tap Sync to pull its rows straight into {label} — no more copy-pasting a CSV by hand. Add more than one sheet (e.g. one per office) as long as they share the same header columns; syncing merges them all into this one table.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sources.length === 0 ? (
            <p className="text-xs text-muted-foreground">No sheets configured yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sources.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-xs border border-border rounded-md px-2.5 py-2">
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate font-medium">{s.label || "(untitled sheet)"}</p>
                    <p className="text-muted-foreground truncate">{s.url}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">{formatDateTime(s.last_synced_at)}</span>
                  <button onClick={() => handleRemove(s)} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded-lg px-3 py-2">{error}</div>
          )}

          <div className="flex items-center gap-2">
            <Input
              placeholder="Label (optional, e.g. Sheet 1)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="max-w-[160px] h-8 text-xs"
            />
            <Input
              placeholder="Paste Google Sheet URL…"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="flex-1 h-8 text-xs"
            />
            <Button size="sm" variant="outline" className="text-foreground shrink-0" onClick={handleAdd} disabled={adding}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>
        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync Now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
