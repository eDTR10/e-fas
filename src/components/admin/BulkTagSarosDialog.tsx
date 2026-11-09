import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { ntcaBalanceApi, BulkTagResult, NtcaBalanceFundCluster } from "../../lib/ntcaBalanceApi";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  new: { text: "Will tag", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  already_tagged: { text: "Already tagged", cls: "bg-muted text-muted-foreground" },
  unmatched: { text: "Pick a category", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
};

// Paste a list of SARO Nos. (a copied column, a sentence — anything) and tag them all at
// once: under one chosen category, or "Auto" — each under the category its PAP already
// belongs to. Always previews first; nothing is saved until "Tag" is pressed.
export function BulkTagSarosDialog({
  open, onOpenChange, fundCluster, clusterLabel, onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fundCluster: NtcaBalanceFundCluster;
  clusterLabel: string;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [preview, setPreview] = useState<BulkTagResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(""); setCategoryId(""); setPreview(null); setError(null);
    ntcaBalanceApi.list().then((cats) => setCategories(cats.map((c) => ({ id: c.id, name: c.name })))).catch(() => {});
  }, [open]);

  // Any edit to the list or category invalidates a previous preview.
  useEffect(() => { setPreview(null); }, [text, categoryId]);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await ntcaBalanceApi.bulkTagSaros({ text, categoryId: categoryId || null, fundCluster, dryRun });
      if (dryRun) {
        setPreview(result);
      } else {
        onDone();
        onOpenChange(false);
      }
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "Couldn't process the list. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const counts = (s: string) => preview?.items.filter((i) => i.status === s).length ?? 0;
  const willTag = counts("new");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Import SAROs — {clusterLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Paste the SARO numbers you want on this page — one per line, or copied straight from the sheet. Numbers
            already tagged are skipped.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">Tag under</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Auto — each SARO's own PAP category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"2026-07-1199\n2026-08-1297\n2026-09-1484"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          {preview && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {preview.items.length} SARO{preview.items.length === 1 ? "" : "s"} found · {counts("new")} to tag ·{" "}
                {counts("already_tagged")} already tagged · {counts("unmatched")} need a category
              </p>
              <div className="max-h-[38vh] overflow-y-auto rounded-lg border border-border">
                {preview.items.map((i) => (
                  <div key={i.saro_no} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-sm last:border-0">
                    <span className="w-28 shrink-0 font-medium text-foreground">{i.saro_no}</span>
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_LABEL[i.status].cls}`}>{STATUS_LABEL[i.status].text}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={i.reason || i.pap}>
                      {i.status === "unmatched" ? i.reason : `${i.category}${i.pap && i.status === "new" ? ` · ${i.pap}` : ""}`}
                    </span>
                  </div>
                ))}
              </div>
              {counts("unmatched") > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  SAROs marked "Pick a category" are skipped. Choose a category above to put them all there.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="justify-end gap-2 border-t border-border">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)}>Cancel</Button>
          {preview ? (
            <Button onClick={() => run(false)} disabled={busy || willTag === 0}>
              {busy ? "Tagging…" : `Tag ${willTag} SARO${willTag === 1 ? "" : "s"}`}
            </Button>
          ) : (
            <Button onClick={() => run(true)} disabled={busy || !text.trim()}>
              {busy ? "Checking…" : "Preview"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
