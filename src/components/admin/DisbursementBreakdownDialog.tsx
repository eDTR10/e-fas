import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { ntcaBalanceApi, DisbursementBreakdown } from "../../lib/ntcaBalanceApi";

const QUARTERS = ["1st Qtr", "2nd Qtr", "3rd Qtr", "4th Qtr"];

const money = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const dateText = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

// What is inside one SARO's "Disbursed" figure on the NTCA Balance page: every
// DV behind it, which date placed it in its quarter, and what was left out and why.
export function DisbursementBreakdownDialog({
  saroNo,
  year,
  onOpenChange,
}: {
  saroNo: string | null;
  year: number | "all";
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<DisbursementBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saroNo) return;
    setData(null);
    setError(null);
    setLoading(true);
    ntcaBalanceApi.disbursementBreakdown(saroNo, year)
      .then(setData)
      .catch(() => setError("Couldn't load the breakdown."))
      .finally(() => setLoading(false));
  }, [saroNo, year]);

  const counted = data?.items.filter((i) => i.counted) ?? [];
  const leftOut = data?.items.filter((i) => !i.counted) ?? [];

  return (
    <Dialog open={!!saroNo} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="border-b border-border">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Disbursements breakdown</p>
          <DialogTitle>SARO {saroNo} — {year === "all" ? "all years" : year}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="py-8 text-center text-sm text-destructive">{error}</p>}

          {data && (
            <>
              <p className="text-xs text-muted-foreground">
                Disbursed is the <b className="text-foreground">Net Amount</b> of each row in the Acctg sheet, under the row's
                <b className="text-foreground"> SARO No.</b> and in the quarter of its <b className="text-foreground">Date</b> —
                the same formula as the spreadsheet. Only a row without those (or a Net not from the Acctg sheet) falls back
                to Date Paid, Date processed, then the year-month inside the DV Number.
              </p>

              <div className="grid grid-cols-5 gap-2 sm:grid-cols-2">
                {QUARTERS.map((q, i) => (
                  <div key={q} className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{q}</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">{money(data.quarters[i])}</p>
                  </div>
                ))}
                <div className="rounded-lg border border-primary/40 bg-primary/10 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total disbursed</p>
                  <p className="text-sm font-bold tabular-nums text-foreground">{money(data.counted_total)}</p>
                </div>
              </div>

              <section>
                <p className="mb-2 text-xs font-semibold text-foreground">Counted ({counted.length})</p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">DV No.</th>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Date used</th>
                        <th className="px-3 py-2">Qtr</th>
                        <th className="px-3 py-2 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {counted.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Nothing counted for this SARO.</td></tr>
                      )}
                      {counted.map((i, idx) => (
                        <tr key={`${i.dv_number}-${i.ors_no}-${idx}`} className="border-t border-border">
                          <td className="px-3 py-2">
                            <p className="font-medium text-foreground">{i.dv_number}</p>
                            <p className="text-[10px] text-muted-foreground">{i.ors_no}</p>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{i.source}</td>
                          <td className="px-3 py-2 text-foreground">
                            {dateText(i.date)}
                            <p className="text-[10px] text-muted-foreground">by {i.basis}</p>
                          </td>
                          <td className="px-3 py-2 text-foreground">{i.quarter ? `Q${i.quarter}${i.year ? ` ${i.year}` : ""}` : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-foreground">
                            {i.net === null ? <span className="text-amber-600 dark:text-amber-400" title={i.reason}>blank</span> : money(i.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 font-bold">
                        <td className="px-3 py-2 text-foreground" colSpan={4}>Total ({data.counted_rows} DV row{data.counted_rows === 1 ? "" : "s"})</td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">{money(data.counted_total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              {leftOut.length > 0 && (
                <section>
                  <p className="mb-2 text-xs font-semibold text-foreground">Not counted in {year === "all" ? "this view" : year} ({leftOut.length})</p>
                  <div className="overflow-x-auto rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <table className="w-full min-w-[640px] text-xs">
                      <tbody>
                        {leftOut.map((i, idx) => (
                          <tr key={`${i.dv_number}-${i.ors_no}-${idx}`} className="border-t border-amber-500/20 first:border-0">
                            <td className="px-3 py-2">
                              <p className="font-medium text-foreground">{i.dv_number}</p>
                              <p className="text-[10px] text-muted-foreground">{i.source}</p>
                            </td>
                            <td className="px-3 py-2 text-amber-700 dark:text-amber-300">{i.reason}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-foreground">{money(i.net)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Not counted here: {money(leftOut.reduce((s, i) => s + Number(i.net || 0), 0))}. Choose "All years" to include other years.
                  </p>
                </section>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t border-border justify-end">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
