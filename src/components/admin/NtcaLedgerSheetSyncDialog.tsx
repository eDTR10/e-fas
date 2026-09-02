import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import Swal from "sweetalert2";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { NTCA, FundCluster, FUND_CLUSTER_OPTIONS } from "../../lib/ntcaApi";
import { ntcaDisbursementApi, NtcaDisbursementBulkRow, NtcaDisbursement } from "../../lib/ntcaDisbursementApi";
import { sheetSyncApi, NTCA_LEDGER_TABLE_BY_CLUSTER } from "../../lib/sheetSyncApi";
import { parseNtcaLedgerPaste, buildExistingAdaIndex, ParsedLedgerRow } from "../../lib/ntcaLedgerPaste";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

function extractError(err: unknown): string {
  const axiosErr = err as { response?: { data?: Record<string, unknown> }; message?: string };
  const data = axiosErr?.response?.data;
  if (!data) return axiosErr?.message ? `Failed — ${axiosErr.message}` : "Failed. Please try again.";
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ");
}

const formatMoney = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const formatMonthLabel = (date: string | null): string => {
  if (!date) return "—";
  const [year, month] = date.split("-");
  return `${MONTH_LABELS[Number(month) - 1] ?? month} ${year}`;
};

interface TabResult {
  title: string;
  rows: ParsedLedgerRow[];
}

// Picks whichever year+month most of the importable rows fall in, so the
// page can jump there after import.
function dominantMonth(rows: ParsedLedgerRow[]): { year: number; month: number } | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.date) continue;
    const key = row.date.slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) { bestKey = key; bestCount = count; }
  }
  if (!bestKey) return null;
  const [year, month] = bestKey.split("-").map(Number);
  return { year, month: month - 1 };
}

// Syncing a whole ledger spreadsheet at once: fetch every tab, parse each
// one independently with ntcaLedgerPaste.ts (a tab's own header row only
// makes sense read on its own — concatenating tabs' raw text first and
// parsing that as one blob would only find the first tab's header and
// mangle everything after it), then combine. ADA-duplicate detection is
// carried forward tab-to-tab (a number "used" by an earlier tab's ready
// rows in this same sync also blocks a later tab from reusing it) — see
// the cumulative index built in `load` below. Balance-pool tracking is
// NOT carried forward the same way (each tab's NTCA pool starts from the
// server's last-saved remaining_balance), so a row that looks "ready"
// here could still fail at actual import time once an earlier tab's rows
// in this same batch are committed first — the backend's own validation
// (which does see those just-committed rows) is what actually protects
// against a real overdraw; any such failure shows up per-row in the
// import result, same as it already does for a single-tab paste.
export function NtcaLedgerSheetSyncDialog({
  open, onOpenChange, fundCluster, ntcas, existingDisbursements, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fundCluster: FundCluster;
  ntcas: NTCA[];
  existingDisbursements: NtcaDisbursement[];
  onImported?: (year?: number, month?: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [tabResults, setTabResults] = useState<TabResult[] | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const fundClusterLabel = FUND_CLUSTER_OPTIONS.find((o) => o.value === fundCluster)?.label ?? fundCluster;

  const load = async () => {
    setLoading(true);
    setError(null);
    setSourceErrors([]);
    setTabResults(null);
    try {
      // A fund cluster can have more than one configured spreadsheet
      // source (see CustomDisbursementSheetSetupDialog) — tabs from every
      // one of them are merged here; a source that failed to fetch is
      // reported separately rather than blocking the others.
      const { sources, tabs } = await sheetSyncApi.fetchNtcaLedgerTabs(NTCA_LEDGER_TABLE_BY_CLUSTER[fundCluster]);
      const failed = sources.filter((s) => s.error);
      if (tabs.length === 0) {
        setError(
          failed.length > 0
            ? failed.map((s) => `${s.label || s.url}: ${s.error}`).join(" | ")
            : "No tabs found across the configured spreadsheet(s) for this cluster.",
        );
        return;
      }
      setSourceErrors(failed.map((s) => `${s.label || s.url}: ${s.error}`));
      const cumulativeAdaIndex = buildExistingAdaIndex(existingDisbursements);
      const results: TabResult[] = [];
      for (const tab of tabs) {
        const parsed = parseNtcaLedgerPaste(tab.csv_text, ntcas, fundCluster, cumulativeAdaIndex);
        results.push({ title: tab.title, rows: parsed.rows });
        for (const row of parsed.rows) {
          if (row.issues.length > 0 || !row.date || !row.adaNo) continue;
          const year = Number(row.date.slice(0, 4));
          const set = cumulativeAdaIndex.get(year) ?? new Set<string>();
          set.add(row.adaNo);
          cumulativeAdaIndex.set(year, set);
        }
      }
      setTabResults(results);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) { load(); setExpanded(new Set()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fundCluster]);

  const allRows = useMemo(() => (tabResults ?? []).flatMap((t) => t.rows), [tabResults]);
  const ready = useMemo(() => allRows.filter((r) => r.issues.length === 0), [allRows]);
  const withIssues = useMemo(() => allRows.filter((r) => r.issues.length > 0), [allRows]);
  const advanceCount = useMemo(() => ready.filter((r) => r.advance).length, [ready]);

  const toggleExpanded = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const handleImport = async () => {
    if (ready.length === 0) return;
    setImporting(true);
    try {
      // Chronological order so the backend's own per-row balance validation
      // (which sees earlier rows in this same batch as already committed)
      // evaluates them in the same sequence the money actually moved in.
      const sortedReady = [...ready].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
      const rows: NtcaDisbursementBulkRow[] = sortedReady.map((r, i) => ({
        ntca: r.ntcaMatch ? r.ntcaMatch.id : null,
        raw_ntca_no: r.rawNtca,
        fund_cluster: fundCluster,
        date: r.date!,
        ada_no: r.adaNo,
        amount: r.amount!,
        particulars: r.particulars,
        row_number: i + 1,
      }));
      const result = await ntcaDisbursementApi.bulkImport(rows, false);
      const failed = result.rows.filter((r) => r.error);
      const landedIn = dominantMonth(sortedReady);
      const monthNote = landedIn
        ? `<p style="margin-bottom:8px;font-size:13px">Jumped to ${MONTH_LABELS[landedIn.month]} ${landedIn.year} — that's where most of these entries landed.</p>`
        : "";
      await Swal.fire({
        icon: failed.length > 0 ? "warning" : "success",
        title: "Sync complete",
        html: `
          <p style="margin-bottom:8px">${result.created} of ${rows.length} row(s) created, across ${tabResults?.length ?? 0} tab(s).</p>
          ${monthNote}
          ${failed.length > 0
            ? `<p style="color:#dc2626;font-size:13px">${failed.length} row(s) failed:</p><ul style="text-align:left;font-size:12px">${failed.map((f) => `<li>Row ${f.row_number}: ${f.error}</li>`).join("")}</ul>`
            : ""}
        `,
        ...swalTheme,
      });
      onImported?.(landedIn?.year, landedIn?.month);
      onOpenChange(false);
    } catch (err) {
      Swal.fire({ icon: "error", title: "Sync failed", text: extractError(err), ...swalTheme });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!importing) onOpenChange(next); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Sync Sheets — {fundClusterLabel}</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              <RefreshCw className="w-4 h-4 inline-block mr-2 animate-spin" /> Fetching every tab and parsing…
            </p>
          ) : error ? (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          ) : tabResults && (
            <>
              <p className="text-xs text-muted-foreground">
                Found {tabResults.length} tab{tabResults.length === 1 ? "" : "s"} across the configured spreadsheet(s).
              </p>

              {sourceErrors.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs rounded-lg px-3 py-2 flex flex-col gap-1">
                  <span className="font-medium">
                    {sourceErrors.length} sheet{sourceErrors.length === 1 ? "" : "s"} couldn't be read — the rest still synced:
                  </span>
                  {sourceErrors.map((e, i) => <span key={i}>{e}</span>)}
                </div>
              )}

              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {ready.length} ready
                </span>
                {advanceCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <AlertTriangle className="w-3.5 h-3.5" /> {advanceCount} advance (no NTCA / insufficient balance)
                  </span>
                )}
                {withIssues.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> {withIssues.length} skipped
                  </span>
                )}
                <Button size="sm" variant="outline" className="text-foreground ml-auto" onClick={load}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Re-fetch
                </Button>
              </div>

              <div className="border border-border rounded-lg overflow-hidden max-h-[45vh] overflow-y-auto">
                {tabResults.map((tab, i) => {
                  const tabReady = tab.rows.filter((r) => r.issues.length === 0);
                  const tabAdvance = tabReady.filter((r) => r.advance).length;
                  const tabIssues = tab.rows.filter((r) => r.issues.length > 0).length;
                  return (
                    <div key={i} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
                        onClick={() => toggleExpanded(i)}
                      >
                        {expanded.has(i) ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                        <span className="text-sm font-medium text-foreground truncate">{tab.title}</span>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {tabReady.length} ready{tabAdvance > 0 ? `, ${tabAdvance} advance` : ""}{tabIssues > 0 ? `, ${tabIssues} skipped` : ""}
                        </span>
                      </button>
                      {expanded.has(i) && (
                        <div className="px-3 pb-3 bg-muted/20">
                          <div className="border border-border rounded-lg overflow-hidden">
                            <div className="grid grid-cols-[85px_75px_90px_80px_1fr_100px] gap-2 px-3 py-1.5 bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              <span>Date</span><span>Month</span><span>NCA</span><span>ADA</span><span className="text-right">Amount</span><span>Status</span>
                            </div>
                            {tab.rows.map((row) => (
                              <div key={row.rowNumber} className={`grid grid-cols-[85px_75px_90px_80px_1fr_100px] gap-2 px-3 py-1.5 border-t border-border text-xs items-center ${row.issues.length > 0 || row.advance ? "bg-destructive/5" : ""}`}>
                                <span className="text-foreground truncate">{row.date ?? (row.rawDate || "—")}</span>
                                <span className="text-muted-foreground truncate">{formatMonthLabel(row.date)}</span>
                                <span className="text-foreground truncate">{row.ntcaMatch ? (row.ntcaMatch.nca_no || row.ntcaMatch.ntca_no) : (row.normalizedNtca || row.rawNtca || "—")}</span>
                                <span className="text-foreground truncate">#{row.adaNo || "—"}</span>
                                <span className="text-right tabular-nums text-foreground">{formatMoney(row.amount)}</span>
                                <span>
                                  {row.issues.length > 0 ? (
                                    <span title={row.issues.join("; ")}><Badge variant="destructive">{row.issues[0]}</Badge></span>
                                  ) : row.advance ? (
                                    <span title={row.advanceReason || "Will be imported as an advance disbursement."}>
                                      <Badge variant="destructive">Advance</Badge>
                                    </span>
                                  ) : (
                                    <Badge variant="success">Ready</Badge>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={importing || loading || ready.length === 0}>
            {importing ? "Importing…" : `Import ${ready.length} row${ready.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
