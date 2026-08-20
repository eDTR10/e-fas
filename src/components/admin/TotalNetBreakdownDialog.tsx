import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Disbursement } from "../../lib/disbursementApi";
import { unmatchedAcctgApi, UnmatchedAcctgEntry } from "../../lib/unmatchedAcctgApi";
import { formatMoney, toNumber } from "../../lib/formatters";

interface TotalNetBreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Whatever the page's active filters currently show — keeps the "In
  // Tracker" total here in agreement with the Total Net KPI the user just
  // tapped, instead of silently switching to an unfiltered figure.
  entries: Disbursement[];
}

interface NetLine {
  key: string;
  dv_number: string;
  ors_no: string;
  claimant: string;
  net: number;
  inTracker: boolean;
}

// Opened from the Total Net KPI card: every DV/ORS line contributing Net
// Amount, plus the Acctg rows that have no matching row in this tracker yet
// (see UnmatchedAcctgEntry / apply_acctg_net_rows) — flagged red rather than
// silently left out, since that money is real even though it has nowhere
// in the tracker to show up on its own.
export function TotalNetBreakdownDialog({ open, onOpenChange, entries }: TotalNetBreakdownDialogProps) {
  const [loading, setLoading] = useState(false);
  const [unmatched, setUnmatched] = useState<UnmatchedAcctgEntry[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setLoading(true);
    unmatchedAcctgApi.list().then(setUnmatched).finally(() => setLoading(false));
  }, [open]);

  const inTrackerLines = useMemo<NetLine[]>(() => (
    entries
      .filter((e) => e.net !== null && e.net !== "")
      .map((e) => ({
        key: `dv-${e.id}`,
        dv_number: e.dv_number,
        ors_no: e.ors_no,
        claimant: e.name_of_claimant,
        net: toNumber(e.net),
        inTracker: true,
      }))
  ), [entries]);

  const notInTrackerLines = useMemo<NetLine[]>(() => (
    unmatched.map((u) => ({
      key: `un-${u.id}`,
      dv_number: u.dv_number,
      ors_no: u.ors_no,
      claimant: "",
      net: toNumber(u.net),
      inTracker: false,
    }))
  ), [unmatched]);

  const combined = useMemo(() => [...inTrackerLines, ...notInTrackerLines], [inTrackerLines, notInTrackerLines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return combined;
    return combined.filter(
      (l) => l.dv_number.toLowerCase().includes(q) || l.ors_no.toLowerCase().includes(q) || l.claimant.toLowerCase().includes(q)
    );
  }, [combined, search]);

  const inTrackerTotal = useMemo(() => inTrackerLines.reduce((s, l) => s + l.net, 0), [inTrackerLines]);
  const notInTrackerTotal = useMemo(() => notInTrackerLines.reduce((s, l) => s + l.net, 0), [notInTrackerLines]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Total Net Breakdown</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Every DV/ORS line with a Net Amount — rows already in this tracker, plus Acctg rows (in red) that
            don't have a matching row here yet. The red rows have no date on file, so they aren't affected by
            the date-range filter above.
          </p>

          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search DV no., ORS no., claimant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
            />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No matches for that search.</p>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
              <div className="grid grid-cols-[130px_1fr_1fr_120px_110px] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">
                <span>DV No.</span>
                <span>ORS No.</span>
                <span>Claimant</span>
                <span className="text-right">Net Amount</span>
                <span>Status</span>
              </div>
              {filtered.map((l) => (
                <div
                  key={l.key}
                  className={`grid grid-cols-[130px_1fr_1fr_120px_110px] gap-3 px-3 py-2 border-b border-border last:border-0 items-center text-sm ${!l.inTracker ? "bg-destructive/5" : ""}`}
                >
                  <span className="text-foreground truncate">{l.dv_number || "—"}</span>
                  <span className="text-foreground truncate">{l.ors_no || "—"}</span>
                  <span className="text-foreground truncate">{l.claimant || "—"}</span>
                  <span className="text-right text-foreground tabular-nums">{formatMoney(l.net)}</span>
                  {l.inTracker ? (
                    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 w-fit">
                      In Tracker
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive w-fit">
                      Not in Tracker
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && (
            <div className="text-sm flex flex-col items-end gap-0.5">
              <p><span className="text-muted-foreground">In Tracker ({inTrackerLines.length} line{inTrackerLines.length === 1 ? "" : "s"}): </span><strong className="text-foreground">{formatMoney(inTrackerTotal)}</strong></p>
              <p><span className="text-muted-foreground">Not in Tracker ({notInTrackerLines.length}): </span><strong className="text-destructive">{formatMoney(notInTrackerTotal)}</strong></p>
              <p className="pt-1.5 mt-1 border-t border-border"><span className="text-muted-foreground">Combined Total: </span><strong className="text-foreground">{formatMoney(inTrackerTotal + notInTrackerTotal)}</strong></p>
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
