import { useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Upload, Trash2, Pencil, FileText, Wallet, CheckCircle2, Clock, Archive, ArchiveRestore, AlertTriangle,
  Settings, Link2,
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
import {
  cashieringTrackerApi, CashieringTrackerEntry, CashieringTrackerImportRow,
} from "../../lib/cashieringTrackerApi";
import { sheetSyncApi } from "../../lib/sheetSyncApi";
import { useTableSort, matchesColumnFilters } from "../../lib/useTableSort";
import { SortFilterHeader } from "../../components/ui/sortable-header";
import { Pagination } from "../../components/ui/pagination";
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

// ── form value shape (everything as strings — that's what inputs give us) ──
interface TrackerForm {
  row_no: string;
  date_received: string;
  claimant: string;
  dv_number: string;
  particulars: string;
  net_amount: string;
  status_of_documents: string;
  fund_cluster: string;
  status_of_ntca: string;
  date_of_ntca_download: string;
  mode_of_payment: string;
  date_paid: string;
  ada_check_no: string;
  remarks: string;
  reasons_responsible: string;
}

const emptyForm = (): TrackerForm => ({
  row_no: "", date_received: "", claimant: "", dv_number: "", particulars: "", net_amount: "",
  status_of_documents: "", fund_cluster: "", status_of_ntca: "", date_of_ntca_download: "",
  mode_of_payment: "", date_paid: "", ada_check_no: "", remarks: "", reasons_responsible: "",
});

const entryToForm = (e: CashieringTrackerEntry): TrackerForm => ({
  row_no: e.row_no, date_received: e.date_received || "", claimant: e.claimant, dv_number: e.dv_number,
  particulars: e.particulars, net_amount: e.net_amount || "", status_of_documents: e.status_of_documents,
  fund_cluster: e.fund_cluster, status_of_ntca: e.status_of_ntca, date_of_ntca_download: e.date_of_ntca_download || "",
  mode_of_payment: e.mode_of_payment, date_paid: e.date_paid || "", ada_check_no: e.ada_check_no,
  remarks: e.remarks, reasons_responsible: e.reasons_responsible,
});

// ─────────────────────────────────────────────────────────────────────────
// Add / Edit dialog
// ─────────────────────────────────────────────────────────────────────────
function EntryFormDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CashieringTrackerEntry | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TrackerForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(editing ? entryToForm(editing) : emptyForm());
      setError(null);
    }
  }, [open, editing]);

  const update = <K extends keyof TrackerForm>(key: K, value: TrackerForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.dv_number.trim() && !form.claimant.trim()) {
      setError("At least a DV Number or Claimant is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        row_no: form.row_no.trim(),
        date_received: form.date_received || null,
        claimant: form.claimant.trim(),
        dv_number: form.dv_number.trim(),
        particulars: form.particulars.trim(),
        net_amount: form.net_amount || null,
        status_of_documents: form.status_of_documents.trim(),
        fund_cluster: form.fund_cluster.trim(),
        status_of_ntca: form.status_of_ntca.trim(),
        date_of_ntca_download: form.date_of_ntca_download || null,
        mode_of_payment: form.mode_of_payment.trim(),
        date_paid: form.date_paid || null,
        ada_check_no: form.ada_check_no.trim(),
        remarks: form.remarks.trim(),
        reasons_responsible: form.reasons_responsible.trim(),
      } as any;
      if (editing) await cashieringTrackerApi.update(editing.id, payload);
      else await cashieringTrackerApi.create(payload);
      Swal.fire({ icon: "success", title: editing ? "Entry updated" : "Entry added", timer: 1200, showConfirmButton: false, ...swalTheme });
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
      <DialogContent className="max-w-3xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>{editing ? `Edit ${editing.dv_number || "Entry"}` : "Add Cashiering Tracker Entry"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>}

          <div className="grid grid-cols-3 gap-4 sm:grid-cols-1">
            {field("No.", <Input value={form.row_no} onChange={(e) => update("row_no", e.target.value)} />)}
            {field("Date Received from ORD", <Input type="date" value={form.date_received} onChange={(e) => update("date_received", e.target.value)} />)}
            {field("DV Number", <Input value={form.dv_number} onChange={(e) => update("dv_number", e.target.value)} />)}
          </div>
          {field("Claimant", <Input value={form.claimant} onChange={(e) => update("claimant", e.target.value)} />)}
          {field("Particular", <textarea rows={2} value={form.particulars} onChange={(e) => update("particulars", e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />)}

          <div className="grid grid-cols-3 gap-4 sm:grid-cols-1">
            {field("Net Amount of DV", <Input type="number" step="0.01" value={form.net_amount} onChange={(e) => update("net_amount", e.target.value)} />)}
            {field("Status of Documents", <Input value={form.status_of_documents} onChange={(e) => update("status_of_documents", e.target.value)} placeholder="e.g. Complete" />)}
            {field("Fund Cluster", <Input value={form.fund_cluster} onChange={(e) => update("fund_cluster", e.target.value)} placeholder="e.g. MDS Regular" />)}
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-1 pt-2 border-t border-border">
            {field("Status of NTCA", <Input value={form.status_of_ntca} onChange={(e) => update("status_of_ntca", e.target.value)} placeholder="e.g. With NTCA" />)}
            {field("Date of NTCA Download", <Input type="date" value={form.date_of_ntca_download} onChange={(e) => update("date_of_ntca_download", e.target.value)} />)}
          </div>

          <div className="grid grid-cols-3 gap-4 sm:grid-cols-1 pt-2 border-t border-border">
            {field("Mode of Payment", <Input value={form.mode_of_payment} onChange={(e) => update("mode_of_payment", e.target.value)} placeholder="e.g. ADA" />)}
            {field("Date Paid ADA/Check", <Input type="date" value={form.date_paid} onChange={(e) => update("date_paid", e.target.value)} />)}
            {field("ADA/Check No.", <Input value={form.ada_check_no} onChange={(e) => update("ada_check_no", e.target.value)} />)}
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-1 pt-2 border-t border-border">
            {field("Remarks", <Input value={form.remarks} onChange={(e) => update("remarks", e.target.value)} />)}
            {field("Reasons / Responsible", <Input value={form.reasons_responsible} onChange={(e) => update("reasons_responsible", e.target.value)} />)}
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
// Bulk Import dialog — paste the "Cashiering Tracker for DVs" CSV, preview,
// then confirm (same preview/confirm shape every other tracker uses).
// ─────────────────────────────────────────────────────────────────────────
function ImportDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<(CashieringTrackerImportRow & { included: boolean })[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCsvText(""); setRows(null); setWarnings([]); setError(null);
    }
  }, [open]);

  const handlePreview = async () => {
    if (!csvText.trim()) { setError("Paste some CSV content first."); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await cashieringTrackerApi.previewImport(csvText);
      setRows(result.rows.map((r) => ({ ...r, included: !r.is_duplicate && !r.missing_required })));
      setWarnings(result.warnings);
    } catch {
      setError("Could not parse this CSV. Check that it includes the header row (DV NUMBER, Net Amount of DV, ...).");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      const result = await cashieringTrackerApi.confirmImport(rows.filter((r) => r.included));
      Swal.fire({ icon: "success", title: "Import complete", text: `${result.created} entr${result.created === 1 ? "y" : "ies"} created.`, ...swalTheme });
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
          <DialogTitle>Bulk Import Cashiering Tracker</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Paste CSV content (including the header row — No., Date Received from ORD, Claimant, DV NUMBER, Particular, Net Amount of DV, ...)
            </label>
            <textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setRows(null); }}
              rows={8}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              placeholder="No.,Date Received from ORD,Claimant,DV NUMBER,Particular,Net Amount of DV, ..."
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
                {rows.filter((r) => r.is_duplicate).length} look already imported,{" "}
                {rows.filter((r) => r.missing_required).length} missing Net Amount,{" "}
                {rows.filter((r) => r.included).length} selected to import.
              </p>
              {warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-xs rounded-lg px-3 py-2 flex flex-col gap-1">
                  {warnings.map((w, i) => <span key={i}>{w}</span>)}
                </div>
              )}
              <div className="border border-border rounded-lg overflow-hidden max-h-[55vh] overflow-y-auto">
                <div className="grid grid-cols-[24px_100px_1fr_140px_120px_auto] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">
                  <span />
                  <span>Date</span>
                  <span>Claimant</span>
                  <span>DV Number</span>
                  <span>Net Amount</span>
                  <span>Status</span>
                </div>
                {rows.map((r, i) => (
                  <div key={i} className={`grid grid-cols-[24px_100px_1fr_140px_120px_auto] gap-3 px-3 py-2.5 border-b border-border last:border-0 items-center text-sm ${r.is_duplicate ? "opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      checked={r.included}
                      onChange={() => setRows((prev) => prev && prev.map((x, j) => (j === i ? { ...x, included: !x.included } : x)))}
                    />
                    <span className="text-xs text-foreground truncate">{r.date_received || "—"}</span>
                    <span className="text-xs text-foreground truncate" title={r.claimant}>{r.claimant || "—"}</span>
                    <span className="text-xs text-foreground truncate">{r.dv_number || "—"}</span>
                    <span className="text-xs text-foreground">{r.net_amount != null ? formatMoney(r.net_amount) : "—"}</span>
                    {r.missing_required ? (
                      <Badge variant="destructive">missing amount</Badge>
                    ) : r.is_duplicate ? (
                      <Badge variant="secondary">duplicate</Badge>
                    ) : (
                      <Badge variant="success">new</Badge>
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
const CashieringTrackerPage = () => {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<CashieringTrackerEntry[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sheetSetupOpen, setSheetSetupOpen] = useState(false);
  const [editing, setEditing] = useState<CashieringTrackerEntry | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = async () => {
    setLoading(true);
    try {
      setEntries(await cashieringTrackerApi.list({ archived: showArchived }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    entries.forEach((e) => { if (e.date_received) years.add(Number(e.date_received.slice(0, 4))); });
    return Array.from(years).sort((a, b) => b - a);
  }, [entries]);

  const {
    year, quarter, dateFrom, dateTo,
    setYear, applyQuarter, setDateFrom, setDateTo,
    clear: clearDateFilters, inRange, hasActiveDateFilter,
  } = useDateRangeFilter(availableYears);

  const fundClusterOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => { if (e.fund_cluster) set.add(e.fund_cluster); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);
  const [fundClusterFilter, setFundClusterFilter] = useState("");

  const clearFilters = () => {
    clearDateFilters(); setSearch(""); setFundClusterFilter("");
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => {
      if (e.date_received && !inRange(e.date_received)) return false;
      if (fundClusterFilter && e.fund_cluster !== fundClusterFilter) return false;
      if (!q) return true;
      return (
        e.dv_number.toLowerCase().includes(q) ||
        e.claimant.toLowerCase().includes(q) ||
        e.particulars.toLowerCase().includes(q) ||
        e.ada_check_no.toLowerCase().includes(q)
      );
    });
  }, [entries, search, fundClusterFilter, inRange]);

  // Per-column sort + filter on top of the search/date/fund-cluster filters.
  const { sortKey, sortDir, toggleSort, applySort } = useTableSort<CashieringTrackerEntry>((row, key) => {
    switch (key) {
      case "date_received": return row.date_received;
      case "claimant": return row.claimant;
      case "dv_number": return row.dv_number;
      case "net_amount": return Number(row.net_amount || 0);
      case "fund_cluster": return row.fund_cluster;
      case "status_of_ntca": return row.status_of_ntca;
      case "mode_of_payment": return row.mode_of_payment;
      default: return null;
    }
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const setColumnFilter = (key: string, value: string) => setColumnFilters((prev) => ({ ...prev, [key]: value }));

  const columnFiltered = useMemo(
    () => filtered.filter((row) => matchesColumnFilters(row, columnFilters, (r, key) => {
      switch (key) {
        case "date_received": return formatDate(r.date_received);
        case "claimant": return r.claimant;
        case "dv_number": return r.dv_number;
        case "net_amount": return formatMoney(r.net_amount);
        case "fund_cluster": return r.fund_cluster;
        case "status_of_ntca": return r.status_of_ntca;
        case "mode_of_payment": return r.mode_of_payment;
        default: return "";
      }
    })),
    [filtered, columnFilters]
  );
  const sorted = useMemo(() => applySort(columnFiltered), [columnFiltered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, fundClusterFilter, columnFilters, inRange, sorted.length]);

  const pageIds = useMemo(() => paginatedData.map((e) => e.id), [paginatedData]);
  const { selected, toggle, toggleAll, clear: clearSelection, isAllSelected, isSomeSelected } = useSelection<number>();

  const handleAdd = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (e: CashieringTrackerEntry) => { setEditing(e); setFormOpen(true); };

  const handleDelete = async (e: CashieringTrackerEntry) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${e.dv_number || "this entry"}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await cashieringTrackerApi.remove(e.id);
    load();
  };

  const handleArchiveToggle = async (e: CashieringTrackerEntry) => {
    if (e.is_archived) await cashieringTrackerApi.unarchive(e.id);
    else await cashieringTrackerApi.archive(e.id);
    load();
  };

  const handleBulkDelete = async () => {
    const count = selected.size;
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${count} entr${count === 1 ? "y" : "ies"}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await cashieringTrackerApi.bulkDelete([...selected]);
    clearSelection();
    load();
  };

  const handleBulkArchive = async (archived: boolean) => {
    await cashieringTrackerApi.bulkArchive([...selected], archived);
    clearSelection();
    load();
  };

  const handleDeleteAll = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete all ${entries.length} Cashiering Tracker record${entries.length === 1 ? "" : "s"}?`,
      html: "This permanently deletes every row, including archived ones — not just what's currently filtered or on this page. This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete all", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    const { deleted } = await cashieringTrackerApi.clearAll();
    Swal.fire({ icon: "success", title: `Deleted ${deleted} entries`, timer: 1300, showConfirmButton: false, ...swalTheme });
    clearSelection();
    load();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await sheetSyncApi.sync("cashiering_tracker");
      const failedSources = result.sources.filter((s) => s.error);
      const counts = result.result.created !== undefined ? `${result.result.created} created` : "";

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

  const totalNetAmount = filtered.reduce((s, e) => s + Number(e.net_amount || 0), 0);
  const paidCount = filtered.filter((e) => !!e.date_paid).length;
  const pendingCount = filtered.length - paidCount;

  return (
    <AdminLayout title="Cashiering Tracker" subtitle="Cashiering Tracker for DVs (AFD-FM-TRK-006)">
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
        hasActiveFilters={hasActiveDateFilter || !!search || !!fundClusterFilter}
      >
        <select
          value={fundClusterFilter}
          onChange={(e) => setFundClusterFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 max-w-[220px]"
        >
          <option value="">All Fund Clusters</option>
          {fundClusterOptions.map((fc) => <option key={fc} value={fc}>{fc}</option>)}
        </select>
      </DateRangeFilterBar>

      <div className="flex items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
        <div className="relative flex-1 max-w-xs sm:max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search DV no., claimant, particulars, ADA/Check no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <div className="flex gap-2 ml-auto sm:ml-0">
          <Button variant="outline" className="text-foreground" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Bulk Import
          </Button>
          <Button variant="outline" className="text-foreground" onClick={handleSync} disabled={syncing} title="Sync from Google Sheets">
            <Settings className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Sheets"}
          </Button>
          <Button variant="outline" className="text-foreground" onClick={() => setSheetSetupOpen(true)} title="Manage Google Sheet sources">
            <Link2 className="w-4 h-4 mr-2" /> Sheet Setup
          </Button>
          <Button variant="outline" className="text-foreground" onClick={handleDeleteAll} disabled={entries.length === 0}>
            <AlertTriangle className="w-4 h-4 mr-2" /> Delete All
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" /> Add Entry
          </Button>
        </div>
      </div>

      <KpiStrip cards={[
        { title: "Total DVs", value: String(filtered.length), icon: FileText },
        { title: "Total Net Amount", value: formatMoney(totalNetAmount), icon: Wallet },
        { title: "Paid", value: String(paidCount), icon: CheckCircle2 },
        { title: "Pending", value: String(pendingCount), icon: Clock },
      ]} />

      <BulkActionBar
        count={selected.size}
        itemLabel="entry"
        onDelete={handleBulkDelete}
        onClear={clearSelection}
        extraActions={
          <Button variant="outline" size="sm" className="text-foreground" onClick={() => handleBulkArchive(!showArchived)}>
            {showArchived ? <ArchiveRestore className="w-3.5 h-3.5 mr-1.5" /> : <Archive className="w-3.5 h-3.5 mr-1.5" />}
            {showArchived ? "Restore" : "Archive"}
          </Button>
        }
      />

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <div className="grid grid-cols-[24px_90px_1fr_120px_110px_130px_130px_130px_auto] gap-3 px-5 py-3 border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[1200px]">
            <SelectAllCheckbox checked={isAllSelected(pageIds)} indeterminate={isSomeSelected(pageIds)} onChange={() => toggleAll(pageIds)} />
            <SortFilterHeader label="Date" sortKey="date_received" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.date_received || ""} onFilterChange={(v) => setColumnFilter("date_received", v)} filterPlaceholder="Filter…" />
            <SortFilterHeader label="Claimant" sortKey="claimant" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.claimant || ""} onFilterChange={(v) => setColumnFilter("claimant", v)} filterPlaceholder="Filter…" />
            <SortFilterHeader label="DV Number" sortKey="dv_number" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.dv_number || ""} onFilterChange={(v) => setColumnFilter("dv_number", v)} filterPlaceholder="Filter…" />
            <SortFilterHeader label="Net Amount" sortKey="net_amount" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.net_amount || ""} onFilterChange={(v) => setColumnFilter("net_amount", v)} filterPlaceholder="Filter…" />
            <SortFilterHeader label="Fund Cluster" sortKey="fund_cluster" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.fund_cluster || ""} onFilterChange={(v) => setColumnFilter("fund_cluster", v)} filterPlaceholder="Filter…" />
            <SortFilterHeader label="Status of NTCA" sortKey="status_of_ntca" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.status_of_ntca || ""} onFilterChange={(v) => setColumnFilter("status_of_ntca", v)} filterPlaceholder="Filter…" />
            <SortFilterHeader label="Mode of Payment" sortKey="mode_of_payment" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.mode_of_payment || ""} onFilterChange={(v) => setColumnFilter("mode_of_payment", v)} filterPlaceholder="Filter…" />
            <span>Actions</span>
          </div>

          {paginatedData.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground min-w-[1200px]">No Cashiering Tracker records found.</div>
          ) : (
            paginatedData.map((e) => (
              <div key={e.id} className="grid grid-cols-[24px_90px_1fr_120px_110px_130px_130px_130px_auto] gap-3 px-5 py-3 border-b border-border last:border-0 items-center text-sm min-w-[1200px] hover:bg-accent/40 transition-colors">
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                <span className="text-foreground whitespace-nowrap">{formatDate(e.date_received)}</span>
                <div className="min-w-0">
                  <p className="text-foreground truncate" title={e.claimant}>{e.claimant || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate" title={e.particulars}>{e.particulars || "—"}</p>
                  {e.is_archived && <Badge variant="destructive" className="mt-0.5">archived</Badge>}
                </div>
                <span className="text-foreground truncate">{e.dv_number || "—"}</span>
                <span className="text-foreground whitespace-nowrap">{formatMoney(e.net_amount)}</span>
                <div className="min-w-0"><CategoryChip label={e.fund_cluster} /></div>
                <div className="min-w-0"><CategoryChip label={e.status_of_ntca} /></div>
                <div className="min-w-0"><CategoryChip label={e.mode_of_payment} /></div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleEdit(e)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleArchiveToggle(e)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title={e.is_archived ? "Unarchive" : "Archive"}>
                    {e.is_archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => handleDelete(e)} className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        totalItems={sorted.length}
        onPageSizeChange={setPageSize}
        availablePageSizes={[10, 25, 50, 100]}
      />

      {!loading && (
        <p className="text-xs text-muted-foreground mt-3">Showing {paginatedData.length} of {sorted.length} record(s) (page {currentPage} of {totalPages || 1})</p>
      )}

      <EntryFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={load} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />
      <SheetSyncManagerDialog open={sheetSetupOpen} onOpenChange={setSheetSetupOpen} table="cashiering_tracker" label="Cashiering Tracker" onSynced={load} />
    </AdminLayout>
  );
};

export default CashieringTrackerPage;
