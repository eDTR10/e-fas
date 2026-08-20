import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { unmatchedAcctgApi, UnmatchedAcctgEntry } from "../../lib/unmatchedAcctgApi";
import { formatMoney, toNumber } from "../../lib/formatters";

interface UnmatchedAcctgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// DVs the Acctg (Net) sheet carries a Net Amount for that have no matching
// row in Disbursement Tracker — either the DV Number isn't in the tracker
// at all, or its ORS No. text doesn't line up with what Acctg recorded
// (e.g. a differing fund/class code segment). This list is rebuilt from
// scratch on every "Net Amount (Acctg)" sync, so it always reflects the
// latest sheet snapshot — see apply_acctg_net_rows in saro/importers.py.
export function UnmatchedAcctgDialog({ open, onOpenChange }: UnmatchedAcctgDialogProps) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<UnmatchedAcctgEntry[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setLoading(true);
    unmatchedAcctgApi.list().then(setEntries).finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.dv_number.toLowerCase().includes(q) || e.ors_no.toLowerCase().includes(q)
    );
  }, [entries, search]);

  const total = useMemo(() => filtered.reduce((s, e) => s + toNumber(e.net), 0), [filtered]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>DVs Not Yet in Tracker</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            These carry a Net Amount in the Acctg sheet but have no matching row here — usually because the
            DV Number isn't in the DV sheet source, or its ORS No. doesn't exactly match what Acctg recorded.
            Add the DV to the DV sheet (or reconcile the ORS No.) and re-sync to clear an entry from this list.
          </p>

          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search DV no. or ORS no..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
            />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {entries.length === 0 ? "Nothing unmatched — every Acctg row has a home." : "No matches for that search."}
            </p>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden max-h-[55vh] overflow-y-auto">
              <div className="grid grid-cols-[1fr_1fr_140px] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">
                <span>DV No.</span>
                <span>ORS No.</span>
                <span className="text-right">Net Amount</span>
              </div>
              {filtered.map((e) => (
                <div key={e.id} className="grid grid-cols-[1fr_1fr_140px] gap-3 px-3 py-2 border-b border-border last:border-0 items-center text-sm">
                  <span className="text-foreground truncate">{e.dv_number}</span>
                  <span className="text-foreground truncate">{e.ors_no}</span>
                  <span className="text-right text-foreground tabular-nums">{formatMoney(e.net)}</span>
                </div>
              ))}
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <p className="text-sm text-foreground text-right">
              <span className="text-muted-foreground">{filtered.length} entr{filtered.length === 1 ? "y" : "ies"} · Total: </span>
              <strong>{formatMoney(total)}</strong>
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-border justify-end">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
