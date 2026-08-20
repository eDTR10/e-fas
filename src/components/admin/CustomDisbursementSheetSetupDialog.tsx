import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  sheetSyncApi, SheetSyncSource, NTCA_LEDGER_TABLE_BY_CLUSTER,
} from "../../lib/sheetSyncApi";
import { FUND_CLUSTER_OPTIONS, FundCluster } from "../../lib/ntcaApi";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

function extractError(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return "Failed to save. Please try again.";
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ");
}

// Each fund cluster gets exactly one whole-spreadsheet source (not a
// stackable list like other Sheet Setup dialogs) — the sync auto-discovers
// every monthly tab inside it, so there's nothing more to configure per
// cluster than the one URL.
export function CustomDisbursementSheetSetupDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sources, setSources] = useState<Partial<Record<FundCluster, SheetSyncSource>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<FundCluster, string>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<FundCluster | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const entries = await Promise.all(
        FUND_CLUSTER_OPTIONS.map(async (o) => {
          const list = await sheetSyncApi.list(NTCA_LEDGER_TABLE_BY_CLUSTER[o.value]);
          return [o.value, list[0]] as const;
        }),
      );
      const nextSources: Partial<Record<FundCluster, SheetSyncSource>> = {};
      const nextDrafts: Partial<Record<FundCluster, string>> = {};
      for (const [cluster, source] of entries) {
        if (source) nextSources[cluster] = source;
        nextDrafts[cluster] = source?.url ?? "";
      }
      setSources(nextSources);
      setDrafts(nextDrafts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const handleSave = async (cluster: FundCluster, label: string) => {
    const url = (drafts[cluster] ?? "").trim();
    setSaving(cluster);
    try {
      const existing = sources[cluster];
      if (!url) {
        if (existing) await sheetSyncApi.remove(existing.id);
      } else if (existing) {
        await sheetSyncApi.update(existing.id, {
          table: NTCA_LEDGER_TABLE_BY_CLUSTER[cluster], label, url, order: 0,
        });
      } else {
        await sheetSyncApi.create({
          table: NTCA_LEDGER_TABLE_BY_CLUSTER[cluster], label, url, order: 0,
        });
      }
      await load();
      Swal.fire({ icon: "success", title: "Saved", timer: 1000, showConfirmButton: false, ...swalTheme });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Could not save", text: extractError(err), ...swalTheme });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Sheet Setup — Custom Disbursement</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            One whole spreadsheet per fund cluster — every tab in it (e.g. "MDS-REGULAR Jan2026", or a merged range
            like "MDS-REGULAR Jan2026-Feb2026") is picked up automatically on sync, and each row lands in whichever
            month its own Date column says, so tabs never need to be added one at a time.
          </p>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : (
            <div className="flex flex-col gap-4">
              {FUND_CLUSTER_OPTIONS.map((o) => (
                <div key={o.value} className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{o.label}</label>
                  <div className="flex gap-2">
                    <Input
                      value={drafts[o.value] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [o.value]: e.target.value }))}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-foreground shrink-0"
                      disabled={saving === o.value || (drafts[o.value] ?? "") === (sources[o.value]?.url ?? "")}
                      onClick={() => handleSave(o.value, o.label)}
                    >
                      {saving === o.value ? "Saving…" : "Save"}
                    </Button>
                  </div>
                  {sources[o.value]?.last_synced_at && (
                    <p className="text-[11px] text-muted-foreground">
                      Last synced {new Date(sources[o.value]!.last_synced_at as string).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="border-t border-border justify-end">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
