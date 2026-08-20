import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { NtcaDisbursement } from "../../lib/ntcaDisbursementApi";

const formatMoney = (value: string | number | null | undefined): string => {
  const n = Number(value || 0);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (value: string): string => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Opened from the "ADA disbursed" KPI card: every disbursement for the
// currently viewed month/cluster, plus a red-flagged breakout of "advance"
// entries — money already paid out against an NCA that hasn't been
// received/logged as an NTCA record yet (`ntca_detail` is null; see
// NtcaDisbursement.ntca in the backend model) — so that money is still
// visible instead of silently missing from the register.
export function AdaDisbursedBreakdownDialog({
  open, onOpenChange, entries, periodLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: NtcaDisbursement[];
  periodLabel: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const ncaText = e.ntca_detail ? `${e.ntca_detail.ntca_no} ${e.ntca_detail.nca_no}` : e.raw_ntca_no;
      return (
        e.ada_no.toLowerCase().includes(q) ||
        ncaText.toLowerCase().includes(q) ||
        e.particulars.toLowerCase().includes(q)
      );
    });
  }, [entries, search]);

  const inLedger = useMemo(() => entries.filter((e) => e.ntca_detail), [entries]);
  const advance = useMemo(() => entries.filter((e) => !e.ntca_detail), [entries]);
  const inLedgerTotal = useMemo(() => inLedger.reduce((s, e) => s + Number(e.amount), 0), [inLedger]);
  const advanceTotal = useMemo(() => advance.reduce((s, e) => s + Number(e.amount), 0), [advance]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>ADA Disbursed — {periodLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Every ADA disbursement for this month/cluster, including advance disbursements (in red) — money already
            paid out against an NCA that hasn't been received/logged as an NTCA record yet.
          </p>

          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search ADA no., NCA, particulars..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {entries.length === 0 ? "No ADA disbursements for this month." : "No matches for that search."}
            </p>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
              <div className="grid grid-cols-[100px_90px_1fr_1fr_110px_120px] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">
                <span>Date</span>
                <span>ADA No.</span>
                <span>NCA</span>
                <span>Particulars</span>
                <span className="text-right">Amount</span>
                <span>Status</span>
              </div>
              {filtered.map((e) => (
                <div
                  key={e.id}
                  className={`grid grid-cols-[100px_90px_1fr_1fr_110px_120px] gap-3 px-3 py-2 border-b border-border last:border-0 items-center text-sm ${!e.ntca_detail ? "bg-destructive/5" : ""}`}
                >
                  <span className="text-foreground truncate">{formatDate(e.date)}</span>
                  <span className="text-foreground truncate">#{e.ada_no || "—"}</span>
                  <span className="text-foreground truncate">
                    {e.ntca_detail ? (e.ntca_detail.nca_no || e.ntca_detail.ntca_no) : (e.raw_ntca_no || "—")}
                  </span>
                  <span className="text-foreground truncate">{e.particulars || "—"}</span>
                  <span className="text-right text-foreground tabular-nums">{formatMoney(e.amount)}</span>
                  {e.ntca_detail ? (
                    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 w-fit">
                      In Ledger
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive w-fit">
                      Advance — no NTCA yet
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="text-sm flex flex-col items-end gap-0.5">
            <p><span className="text-muted-foreground">In Ledger ({inLedger.length}): </span><strong className="text-foreground">{formatMoney(inLedgerTotal)}</strong></p>
            <p><span className="text-muted-foreground">No NTCA Yet ({advance.length}): </span><strong className="text-destructive">{formatMoney(advanceTotal)}</strong></p>
            <p className="pt-1.5 mt-1 border-t border-border"><span className="text-muted-foreground">Combined Total: </span><strong className="text-foreground">{formatMoney(inLedgerTotal + advanceTotal)}</strong></p>
          </div>
        </div>

        <DialogFooter className="border-t border-border justify-end">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
