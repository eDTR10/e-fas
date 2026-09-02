import { useEffect, useMemo, useState } from "react";
import { ClipboardPaste, CheckCircle2, AlertTriangle, Pencil } from "lucide-react";
import Swal from "sweetalert2";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { QuickFillSelect } from "../ui/quick-fill-select";
import { NTCA, FundCluster, FUND_CLUSTER_OPTIONS } from "../../lib/ntcaApi";
import { ntcaDisbursementApi, NtcaDisbursementBulkRow, NtcaDisbursement } from "../../lib/ntcaDisbursementApi";
import {
  parseNtcaLedgerPaste, buildExistingAdaIndex, ParseResult, ParsedLedgerRow, RowOverride,
} from "../../lib/ntcaLedgerPaste";

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

// One NCA No. can span several NTCA tranches (see ntcaLedgerPaste.ts's own
// pooling) — the dropdown only needs to offer each NCA No. once, not one
// entry per tranche.
function buildNcaOptions(ntcas: NTCA[], fundCluster: FundCluster): { nca_no: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const ntca of ntcas) {
    if (ntca.fund_cluster !== fundCluster || !ntca.nca_no) continue;
    if (!seen.has(ntca.nca_no)) {
      seen.set(ntca.nca_no, ntca.particulars || ntca.saro_no || "");
    }
  }
  return Array.from(seen.entries())
    .map(([nca_no, hint]) => ({ nca_no, label: hint ? `${nca_no} — ${hint}` : nca_no }))
    .sort((a, b) => a.nca_no.localeCompare(b.nca_no, undefined, { numeric: true }));
}

// Full-row edit modal — every field the parser reads is editable here, not
// just the NCA No., since a source sheet can leave any of them blank or
// wrong (see the "Missing NCA number" rows this was built for). The NCA
// field pairs a dropdown of every real NCA No. on file for this cluster
// (QuickFillSelect — pick to fill, never has to track what's typed
// afterward) with a manual text input, matching how every other dialog in
// this app lets you pick-or-type a reference number.
function EditRowDialog({
  open, onOpenChange, row, ncaOptions, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ParsedLedgerRow | null;
  ncaOptions: { nca_no: string; label: string }[];
  onSave: (rowId: number, override: RowOverride) => void;
}) {
  const [date, setDate] = useState("");
  const [ncaNo, setNcaNo] = useState("");
  const [adaNo, setAdaNo] = useState("");
  const [amount, setAmount] = useState("");
  const [particulars, setParticulars] = useState("");

  useEffect(() => {
    if (!open || !row) return;
    setDate(row.date ?? "");
    setNcaNo(row.normalizedNtca || row.rawNtca);
    setAdaNo(row.rawAda);
    setAmount(row.rawAmount);
    setParticulars(row.particulars);
  }, [open, row]);

  const handleSave = () => {
    if (!row) return;
    onSave(row.rowId, {
      rawDate: date,
      rawNtca: ncaNo,
      rawAda: adaNo,
      rawAmount: amount,
      particulars,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Edit Row{row ? ` — #${row.adaNo || row.rawAda || row.rowNumber}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            Date
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            NCA No.
            <QuickFillSelect
              placeholder="Pick from existing NCAs…"
              items={ncaOptions}
              getLabel={(o) => o.label}
              onPick={(o) => setNcaNo(o.nca_no)}
            />
            <Input value={ncaNo} onChange={(e) => setNcaNo(e.target.value)} placeholder="NCA No." />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              ADA No.
              <Input value={adaNo} onChange={(e) => setAdaNo(e.target.value)} placeholder="e.g. 510" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              Amount
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            Particulars
            <Input value={particulars} onChange={(e) => setParticulars(e.target.value)} />
          </label>
        </div>
        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save &amp; re-check</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
  // Manually-edited fields for specific rows, keyed by rowId (stable across
  // re-parses — see ParsedLedgerRow.rowId) — for a row whose source sheet
  // left a cell blank or wrong, rather than forcing a fix-and-re-paste
  // round trip. Re-running the full parse with these applied (see
  // reparse) means an edited row goes through the exact same pool/balance
  // validation as any other, instead of just cosmetically patching the
  // preview.
  const [manualRowOverrides, setManualRowOverrides] = useState<Map<number, RowOverride>>(new Map());
  const [editingRow, setEditingRow] = useState<ParsedLedgerRow | null>(null);

  const fundClusterLabel = FUND_CLUSTER_OPTIONS.find((o) => o.value === fundCluster)?.label ?? fundCluster;
  const ncaOptions = useMemo(() => buildNcaOptions(ntcas, fundCluster), [ntcas, fundCluster]);

  const parsed = result?.rows ?? null;
  const ready = useMemo(() => (parsed ?? []).filter((r) => r.issues.length === 0), [parsed]);
  const withIssues = useMemo(() => (parsed ?? []).filter((r) => r.issues.length > 0), [parsed]);
  const advanceCount = useMemo(() => ready.filter((r) => r.advance).length, [ready]);

  const reset = () => {
    setText("");
    setSecondaryNcaNo("");
    setResult(null);
    setManualRowOverrides(new Map());
    setEditingRow(null);
  };

  // Goes back to the paste/NCA-field view without losing what's already
  // there — used to fill in the secondary-block NCA No. and re-parse
  // without having to re-paste the whole range from scratch.
  const backToEdit = () => setResult(null);

  const reparse = (overrides: Map<number, RowOverride>) => {
    if (!text.trim()) return;
    const existingAdaIndex = buildExistingAdaIndex(existingDisbursements);
    setResult(parseNtcaLedgerPaste(text, ntcas, fundCluster, existingAdaIndex, secondaryNcaNo, overrides));
  };

  const handleParse = () => reparse(manualRowOverrides);

  const saveRowOverride = (rowId: number, override: RowOverride) => {
    const next = new Map(manualRowOverrides);
    next.set(rowId, override);
    setManualRowOverrides(next);
    reparse(next);
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
            A row whose NCA hasn't been received/logged yet — or has, but doesn't have enough balance to cover it —
            still imports as an <strong>advance disbursement</strong> instead of being skipped, flagged red below and
            on the page afterward. Any row can also be edited directly here before importing.
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
                    <AlertTriangle className="w-3.5 h-3.5" /> {advanceCount} advance (no NTCA / insufficient balance)
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
                          <th className="px-2 py-1.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.map((row) => {
                          const isOverridden = manualRowOverrides.has(row.rowId);
                          return (
                            <tr key={row.rowId} className={`border-t border-border ${row.issues.length > 0 || row.advance ? "bg-destructive/5" : ""}`}>
                              <td className="px-2 py-1.5 whitespace-nowrap">{row.date ?? (row.rawDate || "—")}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{formatMonthLabel(row.date)}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap">
                                <span title={isOverridden ? "Manually edited" : undefined} className={isOverridden ? "underline decoration-dotted" : ""}>
                                  {row.ntcaMatch ? (row.ntcaMatch.nca_no || row.ntcaMatch.ntca_no) : (row.normalizedNtca || row.rawNtca || "—")}
                                </span>
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
                                  <span title={row.advanceReason || "Will be imported as an advance disbursement."}>
                                    <Badge variant="destructive">Advance</Badge>
                                  </span>
                                ) : (
                                  <Badge variant="success">Ready</Badge>
                                )}
                              </td>
                              <td className="px-2 py-1.5">
                                <button onClick={() => setEditingRow(row)} className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit this row">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
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

      <EditRowDialog
        open={editingRow !== null}
        onOpenChange={(next) => { if (!next) setEditingRow(null); }}
        row={editingRow}
        ncaOptions={ncaOptions}
        onSave={saveRowOverride}
      />
    </Dialog>
  );
}
