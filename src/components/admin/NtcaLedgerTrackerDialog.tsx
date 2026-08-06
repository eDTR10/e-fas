import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import { NTCA } from "../../lib/ntcaApi";
import { ntcaApi } from "../../lib/ntcaApi";

const formatMoney = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value: string): string => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

interface NcaGroup {
  ncaNo: string;
  tranches: NTCA[];
  representative: NTCA;
}

// One NCA No. commonly spans several separate NTCA "tranches" (each its
// own receipt, with its own date/amount) that Custom Disbursement treats
// as a single pooled balance — group them here too, so adding one NCA can
// track every tranche behind it in one action instead of one at a time.
function groupByNcaNo(ntcas: NTCA[]): NcaGroup[] {
  const map = new Map<string, NTCA[]>();
  for (const n of ntcas) {
    const key = n.nca_no || `__id_${n.id}`;
    const list = map.get(key) ?? [];
    list.push(n);
    map.set(key, list);
  }
  return [...map.entries()].map(([ncaNo, tranches]) => {
    const sorted = [...tranches].sort((a, b) =>
      a.date_of_ntca.localeCompare(b.date_of_ntca) || a.id - b.id);
    return { ncaNo, tranches: sorted, representative: sorted[0] };
  });
}

// Lets the user opt specific NCAs into Custom Disbursement's roll-forward
// table, scoped to the month currently being viewed: adding one only
// tracks the tranches already received by then — a tranche dated in a
// later month stays untracked until you're viewing that later month and
// add it deliberately, at which point it "arrives" and starts rolling
// forward from there on its own (Closing → next month's Opening).
export function NtcaLedgerTrackerDialog({
  open, onOpenChange, ntcas, onChanged, viewingMonthEnd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ntcas: NTCA[];
  onChanged?: () => void;
  // Exclusive upper bound (first day of the month AFTER the one being
  // viewed) — only tranches dated before this get tracked when "Add" is
  // clicked; later ones stay available to add once their own month comes.
  viewingMonthEnd?: string;
}) {
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const groups = groupByNcaNo(ntcas);
  const filtered = groups.filter((g) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return g.ncaNo.toLowerCase().includes(q) ||
      g.tranches.some((t) => t.ntca_no.toLowerCase().includes(q) || t.particulars.toLowerCase().includes(q));
  });

  const inScopeTranches = (g: NcaGroup) =>
    viewingMonthEnd ? g.tranches.filter((t) => t.date_of_ntca < viewingMonthEnd) : g.tranches;

  const handleAdd = async (group: NcaGroup) => {
    const toTrack = inScopeTranches(group);
    if (toTrack.length === 0) return;
    setBusyKey(group.ncaNo);
    try {
      await Promise.all(toTrack.map((t) => ntcaApi.trackInLedger(t.id)));
      onChanged?.();
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setSearch(""); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Add NCA to Ledger</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Only NCAs added here show up in the roll-forward table below, and only for the tranches (separate
            receipts) already received through the month you're viewing — a tranche dated later stays out until
            you're viewing its own month.
          </p>
          <Input
            placeholder="Search NCA no. or particulars…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-xs"
          />
          <div className="max-h-[360px] overflow-y-auto flex flex-col gap-1.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                {groups.length === 0 ? "Every NCA in this fund cluster is already in the ledger." : "No matches."}
              </p>
            ) : (
              filtered.map((g) => {
                const inScope = inScopeTranches(g);
                const outOfScopeCount = g.tranches.length - inScope.length;
                const inScopeAmount = inScope.reduce((sum, t) => sum + (Number(t.remaining_balance) || 0), 0);
                const nothingToAddYet = inScope.length === 0;
                return (
                  <div key={g.ncaNo} className="flex items-center gap-2 text-xs border border-border rounded-md px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">
                        {g.ncaNo || "(no NCA no.)"}{" "}
                        <span className="font-normal text-muted-foreground">
                          · dated {formatDate(g.representative.date_of_ntca)}
                          {g.tranches.length > 1 ? ` · ${g.tranches.length} tranches` : ""}
                        </span>
                      </p>
                      <p className="text-muted-foreground truncate">
                        {g.representative.ntca_no} · {g.tranches.map((t) => t.particulars || t.remarks).find(Boolean) || "—"}
                      </p>
                      {nothingToAddYet ? (
                        <p className="text-amber-600 dark:text-amber-400">
                          Not received yet as of this month — becomes addable once you're viewing {formatDate(g.representative.date_of_ntca)}'s month
                        </p>
                      ) : (
                        <p className="text-emerald-600 dark:text-emerald-400">
                          {inScope.length} tranche{inScope.length === 1 ? "" : "s"} addable now · {formatMoney(inScopeAmount)}
                          {outOfScopeCount > 0 ? ` · ${outOfScopeCount} more arrive in later months` : ""}
                        </p>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="text-foreground shrink-0" onClick={() => handleAdd(g)} disabled={busyKey === g.ncaNo || nothingToAddYet}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <DialogFooter className="border-t border-border justify-end">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
