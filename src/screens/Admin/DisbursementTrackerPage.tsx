import { useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Upload, Trash2, Pencil, FileText, Wallet, Scale, AlertTriangle,
  Link2, Link2Off, ChevronDown, ChevronRight, RefreshCw, Settings,
} from "lucide-react";
import KpiStrip from "../../components/ui/kpi-strip";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import { TableSkeleton } from "./Skeleton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { CategoryChip } from "../../components/ui/category-chip";
import DateRangeFilterBar from "../../components/filters/DateRangeFilterBar";
import { useDateRangeFilter } from "../../lib/useDateRangeFilter";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import { sheetSyncApi } from "../../lib/sheetSyncApi";
import { disbursementApi, Disbursement, DisbursementImportRow } from "../../lib/disbursementApi";

import { raodApi, raodOrsKey, SARO } from "../../lib/raodApi";
import { groupDisbursements, DisbursementGroup } from "../../lib/disbursementGrouping";
import { useTableSort, matchesColumnFilters } from "../../lib/useTableSort";
import { SortFilterHeader, SortableHeader } from "../../components/ui/sortable-header";
import { QuickFillSelect } from "../../components/ui/quick-fill-select";
import { Pagination } from "../../components/ui/pagination";
import { DisbursementDetailDialog } from "../../components/admin/detail/DisbursementDetailDialog";
import { BulkActionBar } from "../../components/ui/bulk-action-bar";
import { SelectAllCheckbox } from "../../components/ui/select-all-checkbox";
import { useSelection } from "../../lib/useSelection";
import { SheetSyncManagerDialog } from "../../components/admin/SheetSyncManagerDialog";


const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

function extractError(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return "Failed to save. Please try again.";
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ");
}

const formatMoney = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

// The sheet's own Fund Source column is free text and has accumulated a
// pile of near-duplicate spellings ("MDS REGULAR", "Regular mds", "SPECIAL
// FUND", "SPECIAL FUNDS", "TRUST FUND - AP", ...) — rather than surface
// every distinct string as its own filter option, bucket every value down
// to the 3 that actually matter by keyword, and treat anything that
// doesn't mention "special" or "trust" as Regular (the common/default
// case, including plain "MDS Regular" and any unlabeled/blank value).
const FUND_SOURCE_CATEGORIES = ["MDS Regular", "MDS Special", "Trust Fund"] as const;
type FundSourceCategory = typeof FUND_SOURCE_CATEGORIES[number];

const normalizeFundSource = (raw: string): FundSourceCategory => {
  const s = raw.toLowerCase();
  if (s.includes("trust")) return "Trust Fund";
  if (s.includes("special")) return "MDS Special";
  return "MDS Regular";
};

// ── form value shape (everything as strings — that's what inputs give us) ──
interface DisbursementForm {
  routing_slip_no: string;
  dv_number: string;
  date: string;
  time_received: string;
  received_by_budget_officer: string;
  efficiency: string;
  remarks: string;
  fund_source: string;
  ors_no: string;
  name_of_claimant: string;
  particulars: string;
  amount: string;
  gross: string;
  net: string;
  date_paid: string;
  ada_check: string;
  nca: string;
}

const emptyForm = (): DisbursementForm => ({
  routing_slip_no: "", dv_number: "", date: "", time_received: "",
  received_by_budget_officer: "", efficiency: "", remarks: "", fund_source: "",
  ors_no: "", name_of_claimant: "", particulars: "", amount: "", gross: "",
  net: "", date_paid: "", ada_check: "", nca: "",
});

const disbursementToForm = (d: Disbursement): DisbursementForm => ({
  routing_slip_no: d.routing_slip_no || "",
  dv_number: d.dv_number || "",
  date: d.date || "",
  time_received: d.time_received || "",
  received_by_budget_officer: d.received_by_budget_officer || "",
  efficiency: d.efficiency || "",
  remarks: d.remarks || "",
  fund_source: d.fund_source || "",
  ors_no: d.ors_no || "",
  name_of_claimant: d.name_of_claimant || "",
  particulars: d.particulars || "",
  amount: d.amount || "",
  gross: d.gross || "",
  net: d.net || "",
  date_paid: d.date_paid || "",
  ada_check: d.ada_check || "",
  nca: d.nca || "",
});

// ─────────────────────────────────────────────────────────────────────────
// Add / Edit dialog — a single, flat Disbursement Tracker (DV) record
// ─────────────────────────────────────────────────────────────────────────
function DisbursementFormDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Disbursement | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<DisbursementForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raodList, setRaodList] = useState<SARO[]>([]);

  useEffect(() => {
    if (open) {
      setForm(editing ? disbursementToForm(editing) : emptyForm());
      setError(null);
    }
  }, [open, editing]);

  useEffect(() => {
    raodApi.list({}).then(setRaodList);
  }, []);

  // Gross is looked up from RAOD by ORS No. — same rule the backend applies
  // on bulk import: RAOD's own Obligated Amount for the RAOD entry whose
  // combined "Class Type - Fund Source - ORS No." key (raodOrsKey) matches
  // this row's ORS No. — not RAOD's bare ORS No. field alone.
  const matchedRaod = raodList.find((r) => raodOrsKey(r) === form.ors_no.trim().toLowerCase());

  useEffect(() => {
    if (!form.ors_no || !matchedRaod) return;
    setForm((prev) => ({ ...prev, gross: matchedRaod.obligated_amount || prev.gross }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ors_no, matchedRaod]);

  const update = <K extends keyof DisbursementForm>(field: K, value: DisbursementForm[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.dv_number.trim() || !form.amount.trim()) {
      setError("DV Number and Amount are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        routing_slip_no: form.routing_slip_no.trim(),
        dv_number: form.dv_number.trim(),
        date: form.date || null,
        time_received: form.time_received.trim(),
        received_by_budget_officer: form.received_by_budget_officer.trim(),
        efficiency: form.efficiency.trim(),
        remarks: form.remarks.trim(),
        fund_source: form.fund_source.trim(),
        ors_no: form.ors_no.trim(),
        name_of_claimant: form.name_of_claimant.trim(),
        particulars: form.particulars.trim(),
        amount: form.amount || "0",
        gross: form.gross || null,
        net: form.net || null,
        date_paid: form.date_paid || null,
        ada_check: form.ada_check.trim(),
        nca: form.nca || null,
      };
      if (editing) await disbursementApi.update(editing.id, payload);
      else await disbursementApi.create(payload);
      Swal.fire({ icon: "success", title: editing ? "DV updated" : "DV added", timer: 1300, showConfirmButton: false, ...swalTheme });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {node}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>{editing ? `Edit ${editing.dv_number}` : "Add DV"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          <div className="grid grid-cols-3 gap-4 slg:grid-cols-2 sm:grid-cols-1">
            {field("Routing Slip No.", <Input value={form.routing_slip_no} onChange={(e) => update("routing_slip_no", e.target.value)} placeholder="26-00062" />)}
            {field("DV Number *", <Input value={form.dv_number} onChange={(e) => update("dv_number", e.target.value)} placeholder="2026-01-0001" />)}
            {field("Date/Time Processed", <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />)}
            {field("Time Received / Time Process", <Input value={form.time_received} onChange={(e) => update("time_received", e.target.value)} placeholder="11:30:00 AM" />)}
            {field("Received by Budget Officer", <Input value={form.received_by_budget_officer} onChange={(e) => update("received_by_budget_officer", e.target.value)} />)}
            {field("Efficiency", <Input value={form.efficiency} onChange={(e) => update("efficiency", e.target.value)} />)}
            {field("Fund Source", <Input value={form.fund_source} onChange={(e) => update("fund_source", e.target.value)} placeholder="MDS REGULAR" />)}
            {field("Amount *", <Input type="number" step="0.01" value={form.amount} onChange={(e) => update("amount", e.target.value)} />)}

            <div className="col-span-2 slg:col-span-1">
              {field("Name of Claimant", <Input value={form.name_of_claimant} onChange={(e) => update("name_of_claimant", e.target.value)} />)}
            </div>

            <div className="col-span-3 slg:col-span-2 sm:col-span-1">
              <div className="bg-muted/40 border border-border rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">ORS No. Lookup (auto-populates Gross from RAOD)</p>
                {field("ORS No. (pick from list, or type manually)", (
                  <>
                    <QuickFillSelect
                      placeholder="Pick from RAOD list…"
                      items={raodList.filter((r) => raodOrsKey(r))}
                      getLabel={(r) => `${raodOrsKey(r)} — ${r.name_of_claimant || r.object_description || "(no claimant)"}`}
                      onPick={(r) => update("ors_no", raodOrsKey(r) || r.ors_no)}
                    />
                    <Input className="mt-1.5" placeholder="e.g. 01-01101101-2026-01-0001" value={form.ors_no} onChange={(e) => update("ors_no", e.target.value)} />
                    <p className="text-[11px] mt-1 text-muted-foreground">
                      {form.ors_no ? (
                        matchedRaod
                          ? <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><Link2 className="w-3 h-3" /> Matched RAOD entry — Obligated Amount {formatMoney(matchedRaod.obligated_amount)}</span>
                          : <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1"><Link2Off className="w-3 h-3" /> No matching RAOD entry for this ORS No.</span>
                      ) : null}
                    </p>
                  </>
                ))}
              </div>
            </div>

            <div className="col-span-2 slg:col-span-1">
              {field("Particulars", <Input value={form.particulars} onChange={(e) => update("particulars", e.target.value)} />)}
            </div>

            <div className="col-span-3 slg:col-span-2 sm:col-span-1">
              {field("Remarks", <Input value={form.remarks} onChange={(e) => update("remarks", e.target.value)} />)}
            </div>

            {field("Gross (auto from RAOD)", <Input type="number" step="0.01" value={form.gross} onChange={(e) => update("gross", e.target.value)} />)}
            {field("Net", <Input type="number" step="0.01" value={form.net} onChange={(e) => update("net", e.target.value)} />)}
            {field("Date Paid", <Input type="date" value={form.date_paid} onChange={(e) => update("date_paid", e.target.value)} />)}
            {field("ADA/Check", <Input value={form.ada_check} onChange={(e) => update("ada_check", e.target.value)} />)}
            {field("NCA", <Input type="number" step="0.01" value={form.nca} onChange={(e) => update("nca", e.target.value)} />)}
          </div>
        </div>

        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Bulk import dialog — paste CSV, preview with missing-required-field flags
// ─────────────────────────────────────────────────────────────────────────
function DisbursementImportDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<(DisbursementImportRow & { included: boolean })[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCsvText("");
      setRows(null);
      setWarnings([]);
      setError(null);
    }
  }, [open]);

  const handlePreview = async () => {
    if (!csvText.trim()) {
      setError("Paste some CSV content first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await disbursementApi.previewImport(csvText);
      setRows(result.rows.map((r) => ({ ...r, included: !r.is_duplicate && !r.missing_required })));
      setWarnings(result.warnings);
    } catch {
      setError("Could not parse this CSV. Check that it includes the header row.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      const result = await disbursementApi.confirmImport(rows.filter((r) => r.included));
      Swal.fire({
        icon: "success",
        title: "Import complete",
        text: `${result.created} DV(s) created.`,
        ...swalTheme,
      });
      onImported();
      onOpenChange(false);
    } catch {
      setError("Import failed. Nothing further was written for this batch.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Bulk Import Disbursement Tracker</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Paste CSV content (including the header row — Routing Slip No., DV Number, Received By Budget Officer, Date/Time Processed, Efficiency, Remarks, Time Received / Time Process, Fund Source, ORS No., Name of Claimant, Particulars, Amount, ...)
            </label>
            <textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setRows(null); }}
              rows={8}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              placeholder="ROUTING SLIP NO.,DV NUMBER,RECEIVED BY BUDGET OFFICER,DATE/TIME PROCESSED,EFFICIENCY,REMARKS,TIME RECEIVED / TIME PROCESS,Fund Source,ORS NO.,NAME OF CLAIMANT,PARTICULARS,AMOUNT,GROSS,NET,DATE PAID,ADA/CHECK,NCA"
            />
          </div>

          <div>
            <Button type="button" variant="outline" className="text-foreground" onClick={handlePreview} disabled={busy}>
              {busy && !rows ? "Parsing…" : "Preview"}
            </Button>
          </div>

          {rows && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-foreground">
                Found <strong>{rows.length}</strong> row(s) —{" "}
                {rows.filter((r) => r.missing_required).length} missing Amount,{" "}
                {rows.filter((r) => r.is_duplicate).length} look already imported,{" "}
                {rows.filter((r) => r.included).length} selected to import.
              </p>
              <p className="text-xs text-muted-foreground">
                Gross isn't in this CSV — it's resolved on import by matching each row's ORS No. against RAOD's Obligated Amount.
              </p>
              {warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-xs rounded-lg px-3 py-2 flex flex-col gap-1">
                  {warnings.map((w, i) => <span key={i}>{w}</span>)}
                </div>
              )}
              <div className="border border-border rounded-lg overflow-hidden max-h-[55vh] overflow-y-auto">
                <div className="grid grid-cols-[24px_1fr_150px_120px_auto] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">
                  <span />
                  <span>DV No. / Claimant</span>
                  <span>Fund Source</span>
                  <span>Amount</span>
                  <span>Status</span>
                </div>
                {rows.map((r, i) => (
                  <div key={i} className={`grid grid-cols-[24px_1fr_150px_120px_auto] gap-3 px-3 py-2.5 border-b border-border last:border-0 items-center text-sm ${r.is_duplicate || r.missing_required ? "opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      checked={r.included}
                      disabled={r.missing_required}
                      onChange={() => setRows((prev) => prev && prev.map((x, j) => (j === i ? { ...x, included: !x.included } : x)))}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{r.dv_number || "(no DV No.)"} — {r.name_of_claimant || "(no claimant)"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDate(r.date)} · row {r.row_number}{r.is_duplicate && " · looks already imported"}
                      </p>
                    </div>
                    <span className="text-xs text-foreground truncate">{r.fund_source || "—"}</span>
                    <span className="text-xs text-foreground">{formatMoney(r.amount)}</span>
                    {r.missing_required ? (
                      <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive w-fit">
                        Missing Amount
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 w-fit">
                        Ready
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || !rows || !rows.some((r) => r.included)}>
            {busy && rows ? "Importing…" : "Confirm & Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────
const DisbursementTrackerPage = () => {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Disbursement[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Disbursement | null>(null);
  const [viewing, setViewing] = useState<Disbursement | null>(null);
  const [fundSourceFilter, setFundSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "paid" | "not_paid">("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recomputing, setRecomputing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sheetSetupOpen, setSheetSetupOpen] = useState(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = async () => {
    setLoading(true);
    try {
      setEntries(await disbursementApi.list({}));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRecomputeGross = async () => {
    setRecomputing(true);
    try {
      const { updated } = await disbursementApi.recomputeGross();
      Swal.fire({ icon: "success", title: `Gross updated on ${updated} row(s)`, timer: 1500, showConfirmButton: false, ...swalTheme });
      load();
    } finally {
      setRecomputing(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await sheetSyncApi.sync("disbursement_tracker");
      const failedSources = result.sources.filter((s) => s.error);
      const r = result.result;
      const counts = [
        r.created !== undefined ? `${r.created} created` : null,
        r.updated !== undefined ? `${r.updated} updated` : null,
        r.linked !== undefined ? `${r.linked} linked` : null,
      ].filter(Boolean).join(", ");

      await Swal.fire({
        icon: failedSources.length > 0 ? "warning" : "success",
        title: "Sync complete",
        html: `
          <p style="margin-bottom:8px">${counts || "Nothing new."}</p>
          ${failedSources.length > 0
            ? `<p style="color:#dc2626;font-size:13px">${failedSources.length} sheet(s) failed:</p><ul style="text-align:left;font-size:12px">${failedSources.map((s) => `<li>${s.label || s.url}: ${s.error}</li>`).join("")}</ul>`
            : ""}
          ${result.warnings.length > 0
            ? `<p style="font-size:12px;margin-top:8px">${result.warnings.length} warning(s) — check the affected rows.</p>`
            : ""}
        `,
        ...swalTheme,
      });
      load();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Sync failed", text: extractError(err), ...swalTheme });
    } finally {
      setSyncing(false);
    }
  };

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    entries.forEach((d) => { if (d.date) years.add(Number(d.date.slice(0, 4))); });
    return Array.from(years).sort((a, b) => b - a);
  }, [entries]);

  const {
    year, quarter, dateFrom, dateTo,
    setYear, applyQuarter, setDateFrom, setDateTo,
    clear: clearDateFilters, inRange, hasActiveDateFilter,
  } = useDateRangeFilter(availableYears);

  const clearFilters = () => {
    clearDateFilters(); setFundSourceFilter(""); setStatusFilter(""); setSearch(""); setCurrentPage(1);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((d) => {
      if (d.date && !inRange(d.date)) return false;
      if (fundSourceFilter && normalizeFundSource(d.fund_source) !== fundSourceFilter) return false;
      if (!q) return true;
      return (
        d.dv_number.toLowerCase().includes(q) ||
        d.routing_slip_no.toLowerCase().includes(q) ||
        d.name_of_claimant.toLowerCase().includes(q) ||
        d.particulars.toLowerCase().includes(q) ||
        d.ors_no.toLowerCase().includes(q)
      );
    });
  }, [entries, search, fundSourceFilter, inRange]);

  // A single DV can carry several ORS No. lines — group them client-side
  // so the table reads as one accordion row per DV Number, same as RAOD.
  // Routing Slip No. is shown as its own column on the DV row (a single
  // slip can cover several DVs) rather than being its own grouping level.
  const groups = useMemo(() => groupDisbursements(filtered), [filtered]);

  // Per-column sort + filter on top of the search/date/fund-source filters.
  const { sortKey, sortDir, toggleSort, applySort } = useTableSort<DisbursementGroup>((row, key) => {
    switch (key) {
      case "dv_number": return row.dv_number;
      case "routing_slip_no": return row.routing_slip_no;
      case "date": return row.date;
      case "name_of_claimant": return row.name_of_claimant;
      case "fund_source": return row.fund_source;
      case "totalAmount": return row.totalAmount;
      case "totalGross": return row.totalGross;
      case "isPaid": return row.isPaid ? 1 : 0;
      default: return null;
    }
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const setColumnFilter = (key: string, value: string) => setColumnFilters((prev) => ({ ...prev, [key]: value }));

  const columnFilteredGroups = useMemo(
    () => groups
      .filter((row) => !statusFilter || (statusFilter === "paid" ? row.isPaid : !row.isPaid))
      .filter((row) => matchesColumnFilters(row, columnFilters, (r, key) => {
        switch (key) {
          case "dv_number": return r.dv_number;
          case "routing_slip_no": return r.routing_slip_no;
          case "date": return formatDate(r.date);
          case "name_of_claimant": return r.name_of_claimant;
          case "fund_source": return r.fund_source;
          case "totalAmount": return formatMoney(r.totalAmount);
          case "totalGross": return formatMoney(r.totalGross);
          default: return "";
        }
      })),
    [groups, columnFilters, statusFilter]
  );
  const sortedGroups = useMemo(() => applySort(columnFilteredGroups), [columnFilteredGroups, sortKey, sortDir]);

  // Pagination — paginate over DV groups, not individual ORS-line records
  const totalPages = Math.ceil(sortedGroups.length / pageSize);
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedGroups.slice(start, start + pageSize);
  }, [sortedGroups, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, fundSourceFilter, statusFilter, inRange, columnFilters, sortedGroups.length]);

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Selection is per individual DV/ORS-line record (the deletable unit),
  // flattened across every DV group on the current page, not just expanded ones.
  const pageEntryIds = useMemo(
    () => paginatedGroups.flatMap((g) => g.entries.map((e) => e.id)),
    [paginatedGroups]
  );
  const { selected, toggle, toggleAll, clear: clearSelection, isAllSelected, isSomeSelected } = useSelection<number>();

  const handleAdd = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (d: Disbursement) => { setEditing(d); setFormOpen(true); };

  const handleDelete = async (d: Disbursement) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${d.dv_number || "this DV"}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await disbursementApi.remove(d.id);
    load();
  };

  const handleBulkDelete = async () => {
    const count = selected.size;
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${count} DV${count === 1 ? "" : "s"}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await Promise.all([...selected].map((id) => disbursementApi.remove(id)));
    clearSelection();
    load();
  };

  const handleDeleteAll = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete all ${entries.length} DV${entries.length === 1 ? "" : "s"}?`,
      text: "This permanently deletes every Disbursement Tracker row — not just what's currently filtered or on this page. This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete all", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    const { deleted } = await disbursementApi.clearAll();
    Swal.fire({ icon: "success", title: `Deleted ${deleted} entries`, timer: 1300, showConfirmButton: false, ...swalTheme });
    clearSelection();
    load();
  };

  return (
    <AdminLayout title="Disbursement Tracker" subtitle="Cashiering tracker for Disbursement Vouchers (DVs)">
      <DateRangeFilterBar
        year={year}
        quarter={quarter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        availableYears={availableYears}
        onYearChange={setYear}
        onQuarterChange={applyQuarter}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClear={clearFilters}
        hasActiveFilters={hasActiveDateFilter || !!fundSourceFilter || !!statusFilter || !!search}
      >
        <select
          value={fundSourceFilter}
          onChange={(e) => setFundSourceFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">All Fund Sources</option>
          {FUND_SOURCE_CATEGORIES.map((fs) => <option key={fs} value={fs}>{fs}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | "paid" | "not_paid")}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">All Statuses</option>
          <option value="paid">Paid</option>
          <option value="not_paid">Not Paid</option>
        </select>
      </DateRangeFilterBar>

      <div className="flex items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
        <div className="relative flex-1 max-w-xs sm:max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search DV no., routing slip no., claimant, particulars, ORS no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <div className="flex gap-2 ml-auto sm:ml-0">
          <Button variant="outline" className="text-foreground" onClick={handleRecomputeGross} disabled={recomputing || entries.length === 0} title="Re-run the RAOD Gross lookup on every existing row">
            <RefreshCw className={`w-4 h-4 mr-2 ${recomputing ? "animate-spin" : ""}`} /> Recompute Gross
          </Button>
          <Button variant="outline" className="text-foreground" onClick={handleSync} disabled={syncing} title="Sync from Google Sheets">
            <Settings className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? 'Syncing…' : 'Sync Sheets'}
          </Button>
          <Button variant="outline" className="text-foreground" onClick={() => setSheetSetupOpen(true)} title="Manage Google Sheet sources">
            <Link2 className="w-4 h-4 mr-2" /> Sheet Setup
          </Button>
          <Button variant="outline" className="text-foreground" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Bulk Import
          </Button>
          <Button variant="outline" className="text-foreground" onClick={handleDeleteAll} disabled={entries.length === 0}>
            <AlertTriangle className="w-4 h-4 mr-2" /> Delete All
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" /> Add DV
          </Button>
        </div>
      </div>

      {/* KPI Strip — Total Amount/Net/Paid are summed per DV (groups), not
          per raw ORS-line record, since both Amount and Net are whole-DV
          totals repeated on every one of a DV's ORS split lines (summing
          the raw entries would double/triple-count a multi-ORS DV). */}
      <KpiStrip cards={[
        { title: "Total Amount", value: formatMoney(groups.reduce((s, g) => s + g.totalAmount, 0)), icon: FileText },
        { title: "Total DVs", value: String(groups.length), icon: Wallet },
        { title: "Total Net", value: formatMoney(groups.reduce((s, g) => s + Number(g.net || 0), 0)), icon: Scale },
        { title: "Paid", value: String(groups.filter((g) => g.isPaid).length), icon: AlertTriangle },
      ]} />

      <BulkActionBar count={selected.size} itemLabel="DV" onDelete={handleBulkDelete} onClear={clearSelection} />

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[24px_24px_1.2fr_1fr_1fr_1fr_90px] gap-3 px-5 py-3 border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide slg:grid-cols-[24px_24px_1.2fr_1fr_auto]">
              <SelectAllCheckbox checked={isAllSelected(pageEntryIds)} indeterminate={isSomeSelected(pageEntryIds)} onChange={() => toggleAll(pageEntryIds)} />
              <span />
              <SortFilterHeader label="DV No." sortKey="dv_number" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.dv_number || ""} onFilterChange={(v) => setColumnFilter("dv_number", v)} filterPlaceholder="Filter…" />
              <div className="slg:hidden">
                <SortFilterHeader label="Claimant" sortKey="name_of_claimant" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                  filterValue={columnFilters.name_of_claimant || ""} onFilterChange={(v) => setColumnFilter("name_of_claimant", v)} filterPlaceholder="Filter…" />
              </div>
              <div className="slg:hidden">
                <SortFilterHeader label="Fund Source" sortKey="fund_source" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                  filterValue={columnFilters.fund_source || ""} onFilterChange={(v) => setColumnFilter("fund_source", v)} filterPlaceholder="Filter…" />
              </div>
              <SortFilterHeader label="Total Amount" sortKey="totalAmount" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.totalAmount || ""} onFilterChange={(v) => setColumnFilter("totalAmount", v)} filterPlaceholder="Filter…" />
              <SortableHeader label="Status" sortKey="isPaid" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
            </div>

            {paginatedGroups.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">No disbursement records found.</div>
            ) : (
              paginatedGroups.map((g) => {
                const groupIds = g.entries.map((e) => e.id);
                return (
                  <div key={g.key}>
                    <div
                      onClick={() => toggleExpanded(g.key)}
                      className="grid grid-cols-[24px_24px_1.2fr_1fr_1fr_1fr_90px] gap-3 px-5 py-3.5 border-b border-border items-center hover:bg-accent/40 transition-colors slg:grid-cols-[24px_24px_1.2fr_1fr_auto] cursor-pointer"
                    >
                      <SelectAllCheckbox
                        checked={isAllSelected(groupIds)}
                        indeterminate={isSomeSelected(groupIds)}
                        onChange={() => toggleAll(groupIds)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button onClick={(e) => { e.stopPropagation(); toggleExpanded(g.key); }} className="text-muted-foreground hover:text-foreground transition">
                        {expanded.has(g.key) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{g.dv_number || "(no DV No.)"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDate(g.date)} · {g.entries.length} ORS line{g.entries.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <p className="text-sm text-foreground truncate slg:hidden">{g.name_of_claimant || "—"}</p>
                      <div className="min-w-0 slg:hidden"><CategoryChip label={g.fund_source} /></div>
                      <p className="text-sm font-medium text-foreground">{formatMoney(g.totalAmount)}</p>
                      <div>
                        {g.isPaid ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Not Paid</Badge>}
                      </div>
                    </div>

                    {expanded.has(g.key) && (
                      <div className="px-5 py-3 bg-muted/20 border-b border-border">
                        <div className="overflow-x-auto">
                          <div className="min-w-[900px] border border-border rounded-lg overflow-hidden">
                            <div className="grid grid-cols-[24px_100px_170px_1.5fr_120px_120px_auto] gap-2 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              <span />
                              <span>Routing Slip</span>
                              <span>ORS No.</span>
                              <span>Particulars</span>
                              <span>Amount</span>
                              <span>Gross</span>
                              <span>Actions</span>
                            </div>
                            {g.entries.map((d) => (
                              <div
                                key={d.id}
                                onClick={() => setViewing(d)}
                                className="grid grid-cols-[24px_100px_170px_1.5fr_120px_120px_auto] gap-2 px-3 py-2.5 border-b border-border last:border-0 items-center text-xs hover:bg-accent/40 transition-colors cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selected.has(d.id)}
                                  onChange={() => toggle(d.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <span className="text-foreground truncate">{d.routing_slip_no || "—"}</span>
                                <span className="text-foreground truncate">{d.ors_no || "—"}</span>
                                <span className="text-foreground truncate">{d.particulars || "—"}</span>
                                <span className="text-foreground">{formatMoney(d.amount)}</span>
                                <span className="text-foreground">{formatMoney(d.gross)}</span>
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => handleEdit(d)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => handleDelete(d)} className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            totalItems={sortedGroups.length}
            onPageSizeChange={setPageSize}
            availablePageSizes={[10, 25, 50, 100]}
          />
        </>
      )}

      {!loading && (
        <p className="text-xs text-muted-foreground mt-3">Showing {paginatedGroups.length} of {sortedGroups.length} DV group(s) — {filtered.length} record(s) total (page {currentPage} of {totalPages})</p>
      )}

      <DisbursementFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={load} />
      <DisbursementImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />
      <DisbursementDetailDialog disbursement={viewing} open={!!viewing} onOpenChange={(open) => !open && setViewing(null)} />
      <SheetSyncManagerDialog open={sheetSetupOpen} onOpenChange={setSheetSetupOpen} table="disbursement_tracker" label="Disbursement Tracker" onSynced={load} />
    </AdminLayout>
  );
};

export default DisbursementTrackerPage;
