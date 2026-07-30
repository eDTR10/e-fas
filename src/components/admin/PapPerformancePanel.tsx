import { useEffect, useMemo, useState } from "react";
import { Landmark, Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import type { ReceivedSARO } from "@/lib/receivedSaroApi";

export interface PapPerformanceRow {
  code: string;
  name: string;
  released: number; // total SARO amount for this PAP
  obligated: number; // total RAOD Obligated Amount for this PAP
  utilizationRate: number; // obligated / released * 100
}

const PAGE_SIZE = 10;

// Detail dialog for one PAP/Project — allocation vs utilized vs efficiency,
// plus the actual SARO records that make up its "released" total.
function PapPerformanceDialog({
  row, onOpenChange, saroList, formatMoney, formatDate,
}: {
  row: PapPerformanceRow | null;
  onOpenChange: (open: boolean) => void;
  saroList: ReceivedSARO[];
  formatMoney: (n: number) => string;
  formatDate: (v: string | null | undefined) => string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSearch("");
    setPage(1);
  }, [row?.code]);

  const linkedSaro = useMemo(
    () => (row ? saroList.filter((s) => s.pap_code === row.code) : []),
    [row, saroList]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return linkedSaro;
    return linkedSaro.filter((s) =>
      s.saro_no.toLowerCase().includes(q) ||
      (s.particulars || "").toLowerCase().includes(q) ||
      (s.pap_name || "").toLowerCase().includes(q)
    );
  }, [linkedSaro, search]);

  useEffect(() => setPage(1), [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!row) return null;

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="border-b border-border">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">PAP / Project Performance</p>
          <DialogTitle>{row.name}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">PAP Code {row.code}</p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-1">
            <div className="bg-muted/40 border border-border rounded-lg p-3 flex flex-col gap-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">PAP Allocation (SARO)</p>
              <p className="text-base font-semibold text-foreground">{formatMoney(row.released)}</p>
            </div>
            <div className="bg-muted/40 border border-border rounded-lg p-3 flex flex-col gap-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total Obligated</p>
              <p className="text-base font-semibold text-foreground">{formatMoney(row.obligated)}</p>
            </div>
            <div className="bg-muted/40 border border-border rounded-lg p-3 flex flex-col gap-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Utilization Rate</p>
              <p className="text-base font-semibold text-foreground">{row.utilizationRate.toFixed(1)}%</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Linked SARO Records</p>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SARO no. or particulars..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              />
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[110px_1fr_100px_120px] gap-2 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>SARO No.</span>
                <span>Particulars</span>
                <span>Received</span>
                <span className="text-right">Amount</span>
              </div>
              {paginated.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">No SARO records for this PAP.</div>
              ) : (
                paginated.map((s) => (
                  <div key={s.id} className="grid grid-cols-[110px_1fr_100px_120px] gap-2 px-3 py-2.5 border-b border-border last:border-0 text-xs items-center">
                    <span className="text-foreground font-medium">{s.saro_no}</span>
                    <span className="text-foreground truncate" title={s.particulars || s.pap_name}>{s.particulars || s.pap_name || "—"}</span>
                    <span className="text-muted-foreground">{formatDate(s.date_received)}</span>
                    <span className="text-foreground text-right font-medium">{formatMoney(Number(s.amount))}</span>
                  </div>
                ))
              )}
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={PAGE_SIZE}
              totalItems={filtered.length}
              showPageSizeSelector={false}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Ranked list of PAP/Project totals (Total Released = SARO amount,
// Utilization Rate = Obligated / Released) — click a row to see its linked
// SARO breakdown.
export default function PapPerformancePanel({
  rows, saroList, formatMoney, formatCompactMoney, formatDate,
}: {
  rows: PapPerformanceRow[];
  saroList: ReceivedSARO[];
  formatMoney: (n: number) => string;
  formatCompactMoney: (n: number) => string;
  formatDate: (v: string | null | undefined) => string;
}) {
  const [selected, setSelected] = useState<PapPerformanceRow | null>(null);
  const [search, setSearch] = useState("");

  // Rank reflects the row's position in the full list (by released amount),
  // not its position among search matches — so filtering doesn't renumber it.
  const rankedRows = useMemo(() => rows.map((r, i) => ({ ...r, rank: i + 1 })), [rows]);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rankedRows;
    return rankedRows.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  }, [rankedRows, search]);

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col max-h-[1100px] lg:max-h-none mb-24">
      <div className="flex items-center gap-3 mb-1">
        <span className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
          <Landmark className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">PAP / Project Performance</h3>
          <p className="text-[11px] text-muted-foreground">Click a PAP to view detailed allotment activity</p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PAP code or project name..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No PAP records for the selected filters.</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No PAP matches "{search}".</p>
      ) : (
        <div className="flex flex-col divide-y divide-border overflow-y-auto mt-3 -mx-2">
          {filteredRows.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => setSelected(r)}
              className="text-left py-3 px-2 hover:bg-accent/40 rounded-md transition-colors"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded bg-primary/15 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0">
                    {r.rank}
                  </span>
                  <span className="text-sm font-medium text-foreground truncate" title={r.name}>{r.name}</span>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Total Released</p>
                  <p className="text-xs font-semibold text-foreground">{formatCompactMoney(r.released)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Utilization Rate</span>
                <span className="text-[10px] font-semibold text-foreground">{r.utilizationRate.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, r.utilizationRate)}%` }} />
              </div>
            </button>
          ))}
        </div>
      )}

      <PapPerformanceDialog
        row={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        saroList={saroList}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    </div>
  );
}
