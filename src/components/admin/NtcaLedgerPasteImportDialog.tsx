import { useMemo, useState } from "react";
import { ClipboardPaste, CheckCircle2, AlertTriangle } from "lucide-react";
import Swal from "sweetalert2";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { NTCA, FundCluster, FUND_CLUSTER_OPTIONS } from "../../lib/ntcaApi";
import { ntcaDisbursementApi, NtcaDisbursementBulkRow, NtcaDisbursement } from "../../lib/ntcaDisbursementApi";
import { parseNtcaLedgerPaste, buildExistingAdaIndex, ParseResult, ParsedLedgerRow } from "../../lib/ntcaLedgerPaste";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

function extractError(err: unknown): string {
  const axiosErr = err as { response?: { data?: Record<string, unknown> }; message?: string };
  const data = axiosErr?.response?.data;
  if (!data) {
    // No response at all means the request never completed (network drop,
    // backend not running, CORS block) — surface the raw axios message
    // instead of a generic string so this is diagnosable without guessing.
    return axiosErr?.message ? `Failed to import — ${axiosErr.message}` : "Failed to import. Please try again.";
  }
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ");
}

const formatMoney = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Every row is placed by its own parsed date, never by whichever month tab
// happens to be open on the page — this just renders that date as a
// human-readable "month landed in" label so it's visible before importing.
const formatMonthLabel = (date: string | null): string => {
  if (!date) return "—";
  const [year, month] = date.split("-");
  return `${MONTH_LABELS[Number(month) - 1] ?? month} ${year}`;
};

// Picks whichever year+month most of the importable rows fall in, so the
// page can jump there after import — a paste occasionally strays into an
// adjacent month (e.g. one late-dated row), but the tab should follow
// where most of the data actually landed.
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

export function NtcaLedgerPasteImportDialog({
  open, onOpenChange, ntcas, fundCluster, existingDisbursements, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ntcas: NTCA[];
  fundCluster: FundCluster;
  // Every disbursement already on file, any fund cluster — ADA numbers
  // are one shared sequence, so a row reusing one already taken needs to
  // be flagged before import, not discovered only when the backend
  // rejects it.
  existingDisbursements: NtcaDisbursement[];
  // Called with the year/month most of the imported rows landed in, so the
  // page can jump its month tab there — otherwise the page silently stays
  // on whatever tab was open before the paste, which reads as "it went to
  // the wrong month" even though it didn't.
  onImported?: (year?: number, month?: number) => void;
}) {
  const [text, setText] = useState("");
  const [secondaryNcaNo, setSecondaryNcaNo] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);

  const fundClusterLabel = FUND_CLUSTER_OPTIONS.find((o) => o.value === fundCluster)?.label ?? fundCluster;

  const parsed = result?.rows ?? null;
  const ready = useMemo(() => (parsed ?? []).filter((r) => r.issues.length === 0), [parsed]);
  const withIssues = useMemo(() => (parsed ?? []).filter((r) => r.issues.length > 0), [parsed]);
  const advanceCount = useMemo(() => ready.filter((r) => r.advance).length, [ready]);

  const reset = () => {
    setText("");
    setSecondaryNcaNo("");
    setResult(null);
  };

  // Goes back to the paste/NCA-field view without losing what's already
  // there — used to fill in the secondary-block NCA No. and re-parse
  // without having to re-paste the whole range from scratch.
  const backToEdit = () => setResult(null);

  const handleParse = () => {
    if (!text.trim()) return;
    const existingAdaIndex = buildExistingAdaIndex(existingDisbursements);
    setResult(parseNtcaLedgerPaste(text, ntcas, fundCluster, existingAdaIndex, secondaryNcaNo));
  };

  const handleImport = async () => {
    if (ready.length === 0) return;
    setImporting(true);
    try {
      const rows: NtcaDisbursementBulkRow[] = ready.map((r) => ({
        ntca: r.ntcaMatch ? r.ntcaMatch.id : null,
        raw_ntca_no: r.rawNtca,
        fund_cluster: fundCluster,
        date: r.date!,
        ada_no: r.adaNo,
        amount: r.amount!,
        particulars: r.particulars,
        row_number: r.rowNumber,
      }));
      const result = await ntcaDisbursementApi.bulkImport(rows, false);
      const failed = result.rows.filter((r) => r.error);
      const landedIn = dominantMonth(ready);
      const monthNote = landedIn
        ? `<p style="margin-bottom:8px;font-size:13px">Jumped to ${MONTH_LABELS[landedIn.month]} ${landedIn.year} — that's where these entries landed, based on their own dates.</p>`
        : "";
      await Swal.fire({
        icon: failed.length > 0 ? "warning" : "success",
        title: "Import complete",
        html: `
          <p style="margin-bottom:8px">${result.created} of ${rows.length} row(s) created.</p>
          ${monthNote}
          ${failed.length > 0
            ? `<p style="color:#dc2626;font-size:13px">${failed.length} row(s) failed:</p><ul style="text-align:left;font-size:12px">${failed.map((f) => `<li>Row ${f.row_number}: ${f.error}</li>`).join("")}</ul>`
            : ""}
        `,
        ...swalTheme,
      });
      onImported?.(landedIn?.year, landedIn?.month);
      reset();
      onOpenChange(false);
    } catch (err) {
      Swal.fire({ icon: "error", title: "Import failed", text: extractError(err), ...swalTheme });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!importing) { onOpenChange(next); if (!next) reset(); } }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Paste Import — {fundClusterLabel}</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-muted-foreground">
            Copy a range from your ledger sheet (e.g. "MDS-SPECIAL") — including the surrounding Balance Forwarded,
            Summary panel, and Sub-Total rows is fine, they're ignored automatically. Only the Date / NTCA / ADA /
            Amount detail block is detected and imported, matched against existing {fundClusterLabel} NCA records.
            A row whose NCA hasn't been received/logged yet still imports as an <strong>advance disbursement</strong> —
            flagged red below and on the page afterward, rather than being skipped.
          </p>

          {!parsed && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the copied range here…"
                rows={10}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">
                  If your paste includes extra "Date / ADA" blocks with no NCA column of their own (e.g. "Balance
                  forwarded/ADA" sections), they're picked up automatically and assigned to whichever NCA No. is
                  dominant in the main block. Only fill this in to override that guess.
                </span>
                <Input
                  placeholder="Override NCA No., e.g. 771 (optional)"
                  value={secondaryNcaNo}
                  onChange={(e) => setSecondaryNcaNo(e.target.value)}
                  className="max-w-[220px] h-8 text-xs"
                />
              </label>
            </>
          )}

          {parsed && (
            <>
              {result && result.includedSecondaryBlocks > 0 && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs rounded-lg px-3 py-2">
                  Also picked up {result.includedSecondaryBlocks} extra "Date / ADA" block{result.includedSecondaryBlocks === 1 ? "" : "s"} ({result.includedSecondaryRows} row{result.includedSecondaryRows === 1 ? "" : "s"}), assigned to NCA {result.secondaryNcaUsed}.
                </div>
              )}
              {result && result.undetectedSecondaryBlocks > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Found {result.undetectedSecondaryBlocks} more "Date / ADA" block{result.undetectedSecondaryBlocks === 1 ? "" : "s"} ({result.undetectedSecondaryRows} row{result.undetectedSecondaryRows === 1 ? "" : "s"}) with no NCA column of their own —
                    <strong> not included yet.</strong>
                  </span>
                  <Button size="sm" variant="outline" className="text-foreground shrink-0 ml-auto border-amber-500/40" onClick={backToEdit}>
                    Go back &amp; add NCA No.
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {ready.length} ready
                </span>
                {advanceCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <AlertTriangle className="w-3.5 h-3.5" /> {advanceCount} advance (NCA not yet received)
                  </span>
                )}
                {withIssues.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> {withIssues.length} skipped
                  </span>
                )}
                <Button size="sm" variant="outline" className="text-foreground ml-auto" onClick={backToEdit}>
                  Edit / re-parse
                </Button>
                <Button size="sm" variant="outline" className="text-foreground" onClick={reset}>
                  Start over
                </Button>
              </div>

              {parsed.length === 0 ? (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded-lg px-3 py-2">
                  Couldn't find a Date / NTCA / ADA header row in the pasted text. Make sure the copied range includes
                  that header row from the sheet.
                </div>
              ) : (
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="max-h-[320px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-1.5">Date</th>
                          <th className="px-2 py-1.5">Month</th>
                          <th className="px-2 py-1.5">NCA</th>
                          <th className="px-2 py-1.5">ADA</th>
                          <th className="px-2 py-1.5 text-right">Amount</th>
                          <th className="px-2 py-1.5">Particulars</th>
                          <th className="px-2 py-1.5">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.map((row) => (
                          <tr key={row.rowNumber} className={`border-t border-border ${row.issues.length > 0 || row.advance ? "bg-destructive/5" : ""}`}>
                            <td className="px-2 py-1.5 whitespace-nowrap">{row.date ?? (row.rawDate || "—")}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{formatMonthLabel(row.date)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              {row.ntcaMatch ? (row.ntcaMatch.nca_no || row.ntcaMatch.ntca_no) : (row.rawNtca || "—")}
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">#{row.adaNo || "—"}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(row.amount)}</td>
                            <td className="px-2 py-1.5 truncate max-w-[160px]">{row.particulars || "—"}</td>
                            <td className="px-2 py-1.5">
                              {row.issues.length > 0 ? (
                                <span title={row.issues.join("; ")}>
                                  <Badge variant="destructive">{row.issues[0]}</Badge>
                                </span>
                              ) : row.advance ? (
                                <span title="No NTCA record found for this NCA No. yet — will be imported as an advance disbursement.">
                                  <Badge variant="destructive">Advance — NCA not received</Badge>
                                </span>
                              ) : (
                                <Badge variant="success">Ready</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          {!parsed ? (
            <Button onClick={handleParse} disabled={!text.trim()}>
              <ClipboardPaste className="w-4 h-4 mr-2" /> Parse
            </Button>
          ) : (
            <Button onClick={handleImport} disabled={importing || ready.length === 0}>
              {importing ? "Importing…" : `Import ${ready.length} row${ready.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
