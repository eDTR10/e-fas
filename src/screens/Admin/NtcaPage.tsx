import {
  Search, Plus, Upload, Trash2, Pencil, Archive, ArchiveRestore, Link2, Link2Off,
  FileText, AlertTriangle, Settings, Scale, ChevronDown, ChevronRight,
} from "lucide-react";
import KpiStrip from "../../components/ui/kpi-strip";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import { TableSkeleton } from "./Skeleton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { QuickFillSelect } from "../../components/ui/quick-fill-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import { ntcaApi, NTCA, NTCAImportRow, FUND_CLUSTER_OPTIONS, FundCluster } from "../../lib/ntcaApi";
import { receivedSaroApi, ReceivedSARO } from "../../lib/receivedSaroApi";
import { classTypeApi, fundSourceApi, papApi, ClassType, FundSource, PAP } from "../../lib/referenceDataApi";
import { Pagination } from "../../components/ui/pagination";
import { NtcaDetailDialog } from "../../components/admin/detail/NtcaDetailDialog";
import { BulkActionBar } from "../../components/ui/bulk-action-bar";
import { SelectAllCheckbox } from "../../components/ui/select-all-checkbox";
import { useSelection } from "../../lib/useSelection";
import DateRangeFilterBar from "../../components/filters/DateRangeFilterBar";
import { useDateRangeFilter } from "../../lib/useDateRangeFilter";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { CategoryChip } from "../../components/ui/category-chip";
import { useTableSort, matchesColumnFilters } from "../../lib/useTableSort";
import { SortFilterHeader } from "../../components/ui/sortable-header";
import { SheetSyncManagerDialog } from "../../components/admin/SheetSyncManagerDialog";
import { sheetSyncApi } from "../../lib/sheetSyncApi";

// ── form value shape (everything as strings — that's what inputs give us) ──
interface NtcaForm {
  particulars: string;
  purpose: string;
  pap_code: string;
  fund_source: string; // FundSource id, as a string for the <select>
  class_type: string;  // ClassType id, as a string for the <select>
  year: string;
  saro_no: string;
  saro_year: string;
  date_of_ntca: string;
  ntca_no: string;
  amount: string;
  nca_no: string;
  remarks: string;
  fund_cluster: string; // which MDS/Trust bank account this cash landed in
}

const emptyForm = (): NtcaForm => ({
  particulars: "", purpose: "", pap_code: "", fund_source: "", class_type: "",
  year: "", saro_no: "", saro_year: "", date_of_ntca: "", ntca_no: "",
  amount: "", nca_no: "", remarks: "", fund_cluster: "",
});

const ntcaToForm = (n: NTCA): NtcaForm => ({
  particulars: n.particulars,
  purpose: n.purpose,
  pap_code: n.pap_code,
  fund_source: n.fund_source ? String(n.fund_source) : "",
  class_type: n.class_type ? String(n.class_type) : "",
  year: n.year != null ? String(n.year) : "",
  saro_no: n.saro_no,
  saro_year: n.saro_year != null ? String(n.saro_year) : "",
  date_of_ntca: n.date_of_ntca || "",
  ntca_no: n.ntca_no,
  amount: n.amount,
  nca_no: n.nca_no,
  remarks: n.remarks,
  fund_cluster: n.fund_cluster || "",
});

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

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

function extractError(err: unknown): string {
  const error = err as {
    code?: string;
    message?: string;
    response?: { data?: Record<string, unknown> | string };
  };
  const data = error?.response?.data;
  if (!data) {
    return error?.code === "ERR_NETWORK"
      ? "Cannot reach the eFAS API server. Check that the backend is running and connected, then try again."
      : error?.message || "The sync request failed before the server responded.";
  }
  if (typeof data === "string") return data.slice(0, 500);
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ");
}

// ─────────────────────────────────────────────────────────────────────────
// Add / Edit dialog — a single, flat NTCA record
// ─────────────────────────────────────────────────────────────────────────
function NtcaFormDialog({
  open, onOpenChange, editing, onSaved, saroList, classTypeList, fundSourceList, papList,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: NTCA | null;
  onSaved: () => void;
  saroList: ReceivedSARO[];
  classTypeList: ClassType[];
  fundSourceList: FundSource[];
  papList: PAP[];
}) {
  const [form, setForm] = useState<NtcaForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(editing ? ntcaToForm(editing) : emptyForm());
      setError(null);
    }
  }, [open, editing]);

  const update = (field: keyof NtcaForm, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  // Picking (or typing) a PAP Code that's tagged with a Fund Cluster in
  // Settings auto-fills the cluster here — saves re-picking something
  // already known from the PAP list.
  const applyPapCode = (code: string) => {
    setForm((prev) => {
      const next = { ...prev, pap_code: code };
      const matchedPap = papList.find((p) => p.code.toLowerCase() === code.trim().toLowerCase());
      if (matchedPap?.fund_cluster) next.fund_cluster = matchedPap.fund_cluster;
      return next;
    });
  };

  const matchedSaro = saroList.find((s) => s.saro_no === form.saro_no);

  const handleSubmit = async () => {
    if (!form.ntca_no.trim() || !form.date_of_ntca || !form.amount.trim()) {
      setError("NTCA No., NTCA Date, and NTCA Amount are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        particulars: form.particulars.trim(),
        purpose: form.purpose.trim(),
        pap_code: form.pap_code.trim(),
        fund_source: form.fund_source ? Number(form.fund_source) : null,
        class_type: form.class_type ? Number(form.class_type) : null,
        year: form.year ? Number(form.year) : null,
        saro_no: form.saro_no.trim(),
        saro_year: form.saro_year ? Number(form.saro_year) : null,
        date_of_ntca: form.date_of_ntca,
        ntca_no: form.ntca_no.trim(),
        amount: form.amount || "0",
        nca_no: form.nca_no.trim(),
        remarks: form.remarks.trim(),
        fund_cluster: form.fund_cluster as FundCluster | "",
      };
      if (editing) await ntcaApi.update(editing.id, payload);
      else await ntcaApi.create(payload);
      Swal.fire({ icon: "success", title: editing ? "NTCA updated" : "NTCA added", timer: 1300, showConfirmButton: false, ...swalTheme });
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
          <DialogTitle>{editing ? `Edit ${editing.ntca_no}` : "Add NTCA"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          <div className="grid grid-cols-3 gap-4 slg:grid-cols-2 sm:grid-cols-1">
            {field("NTCA No. *", <Input value={form.ntca_no} onChange={(e) => update("ntca_no", e.target.value)} placeholder="26-02-129" />)}
            {field("NTCA Date *", <Input type="date" value={form.date_of_ntca} onChange={(e) => update("date_of_ntca", e.target.value)} />)}
            {field("NTCA Amount *", <Input type="number" step="0.01" value={form.amount} onChange={(e) => update("amount", e.target.value)} />)}

            <div className="col-span-2 slg:col-span-1">
              {field("SARO No. (pick from list, or type manually below)", (
                <QuickFillSelect
                  placeholder="Pick from Received SARO list…"
                  items={saroList}
                  getLabel={(s) => `${s.saro_no} — ${s.pap_name || "(no PAP name)"}`}
                  onPick={(s) => update("saro_no", s.saro_no)}
                />
              ))}
              <Input className="mt-1.5" placeholder="SARO No." value={form.saro_no} onChange={(e) => update("saro_no", e.target.value)} />
              <p className="text-[11px] mt-1 text-muted-foreground">
                {form.saro_no ? (
                  matchedSaro
                    ? <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><Link2 className="w-3 h-3" /> Will link to Received SARO #{matchedSaro.id} ({matchedSaro.pap_name || "no PAP name"})</span>
                    : <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1"><Link2Off className="w-3 h-3" /> No matching Received SARO — this NTCA will be saved unlinked</span>
                ) : null}
              </p>
            </div>
            {field("SARO Year", <Input type="number" value={form.saro_year} onChange={(e) => update("saro_year", e.target.value)} />)}

            {field("PAP Code", (
              <>
                <QuickFillSelect
                  placeholder="Pick from PAP list…"
                  items={papList}
                  getLabel={(p) => `${p.code} — ${p.name}`}
                  onPick={(p) => applyPapCode(p.code)}
                />
                <Input className="mt-1.5" value={form.pap_code} onChange={(e) => applyPapCode(e.target.value)} />
              </>
            ))}
            {field("Year", <Input type="number" value={form.year} onChange={(e) => update("year", e.target.value)} />)}

            {field("Class Type", (
              <>
                <QuickFillSelect
                  placeholder="Pick from Class Type list…"
                  items={classTypeList}
                  getLabel={(ct) => `${ct.code} — ${ct.name}`}
                  onPick={(ct) => update("class_type", String(ct.id))}
                />
                <select
                  value={form.class_type}
                  onChange={(e) => update("class_type", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                >
                  <option value="">—</option>
                  {classTypeList.map((ct) => <option key={ct.id} value={ct.id}>{ct.code} — {ct.name}</option>)}
                </select>
              </>
            ))}
            <div className="col-span-2 slg:col-span-1">
              {field("Fund Source", (
                <>
                  <QuickFillSelect
                    placeholder="Pick from Fund Source list…"
                    items={fundSourceList}
                    getLabel={(fs) => `${fs.code} — ${fs.name}`}
                    onPick={(fs) => update("fund_source", String(fs.id))}
                  />
                  <select
                    value={form.fund_source}
                    onChange={(e) => update("fund_source", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                  >
                    <option value="">—</option>
                    {fundSourceList.map((fs) => <option key={fs.id} value={fs.id}>{fs.code} — {fs.name}</option>)}
                  </select>
                </>
              ))}
            </div>

            {field("NCA No.", <Input value={form.nca_no} onChange={(e) => update("nca_no", e.target.value)} />)}
            {field("Fund Cluster (which bank account this cash landed in)", (
              <select
                value={form.fund_cluster}
                onChange={(e) => update("fund_cluster", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              >
                <option value="">—</option>
                {FUND_CLUSTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ))}
            <div className="col-span-2 slg:col-span-1">
              {field("Particulars", <Input value={form.particulars} onChange={(e) => update("particulars", e.target.value)} />)}
            </div>
            <div className="col-span-3 slg:col-span-2 sm:col-span-1">
              {field("Purpose", <Input value={form.purpose} onChange={(e) => update("purpose", e.target.value)} />)}
            </div>
            <div className="col-span-3 slg:col-span-2 sm:col-span-1">
              {field("Remarks", <Input value={form.remarks} onChange={(e) => update("remarks", e.target.value)} />)}
            </div>
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
// Bulk import dialog — paste CSV, preview with a clear SARO-match indicator
// per row (a matched row auto-links to its Received SARO on confirm)
// ─────────────────────────────────────────────────────────────────────────
function NtcaImportDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<(NTCAImportRow & { included: boolean })[] | null>(null);
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
      const result = await ntcaApi.previewImport(csvText);
      setRows(result.rows.map((r) => ({ ...r, included: !r.is_duplicate })));
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
      const result = await ntcaApi.confirmImport(rows.filter((r) => r.included));
      Swal.fire({
        icon: "success",
        title: "Import complete",
        text: `${result.created} NTCA created, ${result.linked} linked to an existing SARO.`,
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
      <DialogContent className="max-w-4xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Bulk Import NTCA</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Paste CSV content (including the header row — Particulars, Purpose, PAP, Fund Source, Year, Class, SARO No., ... Remarks, Fund Cluster)
            </label>
            <textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setRows(null); }}
              rows={8}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              placeholder="PARTICULARS,PURPOSE,PAP,FUND SOURCE,YEAR,CLASS,SARO NO., ...,FUND CLUSTER"
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
                Found <strong>{rows.length}</strong> NTCA row(s) —{" "}
                {rows.filter((r) => r.saro_match).length} linked to an existing Received SARO,{" "}
                {rows.filter((r) => !r.saro_match).length} with no matching SARO,{" "}
                {rows.filter((r) => r.included).length} selected to import.
              </p>
              {warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-xs rounded-lg px-3 py-2 flex flex-col gap-1">
                  {warnings.map((w, i) => <span key={i}>{w}</span>)}
                </div>
              )}
              <div className="border border-border rounded-lg overflow-hidden max-h-[55vh] overflow-y-auto">
                <div className="grid grid-cols-[24px_1fr_150px_120px_auto] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">
                  <span />
                  <span>NTCA No. / Particulars</span>
                  <span>SARO No.</span>
                  <span>Amount</span>
                  <span>SARO Match</span>
                </div>
                {rows.map((r, i) => (
                  <div key={i} className={`grid grid-cols-[24px_1fr_150px_120px_auto] gap-3 px-3 py-2.5 border-b border-border last:border-0 items-center text-sm ${r.is_duplicate ? "opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      checked={r.included}
                      onChange={() => setRows((prev) => prev && prev.map((x, j) => (j === i ? { ...x, included: !x.included } : x)))}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{r.ntca_no} — {r.particulars || "(no particulars)"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDate(r.date_of_ntca)} · row {r.row_number}
                        {r.fund_cluster_label && ` · ${r.fund_cluster_label}`}
                        {r.is_duplicate && " · looks already imported"}
                      </p>
                    </div>
                    <span className="text-xs text-foreground truncate">{r.saro_no || "—"}</span>
                    <span className="text-xs text-foreground">{formatMoney(r.amount)}</span>
                    {r.saro_match ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 w-fit">
                        <Link2 className="w-3 h-3" /> #{r.saro_match.id} {r.saro_match.pap_name || r.saro_match.saro_no}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground w-fit">
                        <Link2Off className="w-3 h-3" /> No SARO — will be unlinked
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
const NtcaPage = () => {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<NTCA[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<NTCA | null>(null);
  const [viewing, setViewing] = useState<NTCA | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sheetSetupOpen, setSheetSetupOpen] = useState(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [saroList, setSaroList] = useState<ReceivedSARO[]>([]);
  const [classTypeList, setClassTypeList] = useState<ClassType[]>([]);
  const [fundSourceList, setFundSourceList] = useState<FundSource[]>([]);
  const [papList, setPapList] = useState<PAP[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      setEntries(await ntcaApi.list({ archived: showArchived }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  useEffect(() => {
    receivedSaroApi.list({}).then(setSaroList);
    classTypeApi.list().then(setClassTypeList);
    fundSourceApi.list().then(setFundSourceList);
    papApi.list().then(setPapList);
  }, []);

  const saroById = useMemo(() => {
    const map = new Map<string, ReceivedSARO>();
    saroList.forEach((s) => map.set(s.saro_no, s));
    return map;
  }, [saroList]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    entries.forEach((n) => { if (n.date_of_ntca) years.add(Number(n.date_of_ntca.slice(0, 4))); });
    return Array.from(years).sort((a, b) => b - a);
  }, [entries]);

  const {
    year, quarter, dateFrom, dateTo,
    setYear, applyQuarter, setDateFrom, setDateTo,
    clear: clearDateFilters, inRange, hasActiveDateFilter,
  } = useDateRangeFilter(availableYears);

  const [fundClusterFilter, setFundClusterFilter] = useState<FundCluster | "unclassified" | "">("");
  const [bulkFundCluster, setBulkFundCluster] = useState<FundCluster>("mds_regular");
  const [settingFundCluster, setSettingFundCluster] = useState(false);

  const clearFilters = () => {
    clearDateFilters(); setSearch(""); setFundClusterFilter("");
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((n) => {
      if (!inRange(n.date_of_ntca)) return false;
      if (fundClusterFilter === "unclassified" ? !!n.fund_cluster : fundClusterFilter && n.fund_cluster !== fundClusterFilter) return false;
      if (!q) return true;
      return (
        n.ntca_no.toLowerCase().includes(q) ||
        n.particulars.toLowerCase().includes(q) ||
        n.saro_no.toLowerCase().includes(q) ||
        n.pap_code.toLowerCase().includes(q)
      );
    });
  }, [entries, search, fundClusterFilter, inRange]);

  // Per-column sort + filter on top of the search/date/fund-cluster filters.
  const { sortKey, sortDir, toggleSort, applySort } = useTableSort<NTCA>((row, key) => {
    switch (key) {
      case "ntca_no": return row.ntca_no;
      case "date_of_ntca": return row.date_of_ntca;
      case "particulars": return row.particulars;
      case "saro_no": return row.saro_no;
      case "amount": return Number(row.amount);
      default: return null;
    }
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const setColumnFilter = (key: string, value: string) => setColumnFilters((prev) => ({ ...prev, [key]: value }));

  const columnFiltered = useMemo(
    () => filtered.filter((row) => matchesColumnFilters(row, columnFilters, (r, key) => {
      switch (key) {
        case "ntca_no": return r.ntca_no;
        case "date_of_ntca": return formatDate(r.date_of_ntca);
        case "particulars": return r.particulars;
        case "saro_no": return r.saro_no;
        case "amount": return formatMoney(r.amount);
        default: return "";
      }
    })),
    [filtered, columnFilters]
  );
  const sorted = useMemo(() => applySort(columnFiltered), [columnFiltered, sortKey, sortDir]);

  // Pagination
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, fundClusterFilter, inRange, columnFilters, sorted.length]);

  const pageIds = useMemo(() => paginatedData.map((n) => n.id), [paginatedData]);
  const { selected, toggle, toggleAll, clear: clearSelection, isAllSelected, isSomeSelected } = useSelection<number>();

  // Backfills fund_cluster on selected rows — see ntcaApi.bulkSetFundCluster.
  // This is how CSV/sheet-imported NTCA (which never carries a fund cluster
  // column) gets tagged so it shows up in NCA Tracker.
  const handleBulkSetFundCluster = async () => {
    const count = selected.size;
    try {
      setSettingFundCluster(true);
      await ntcaApi.bulkSetFundCluster([...selected], bulkFundCluster);
      const label = FUND_CLUSTER_OPTIONS.find((o) => o.value === bulkFundCluster)?.label || bulkFundCluster;
      Swal.fire({ icon: "success", title: `Tagged ${count} record${count === 1 ? "" : "s"} to ${label}`, timer: 1300, showConfirmButton: false, ...swalTheme });
      clearSelection();
      load();
    } catch (err) {
      Swal.fire({ icon: "error", title: "Couldn't set fund cluster", text: extractError(err), ...swalTheme });
    } finally {
      setSettingFundCluster(false);
    }
  };

  const handleAdd = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (n: NTCA) => { setEditing(n); setFormOpen(true); };

  const handleDelete = async (n: NTCA) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${n.ntca_no}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await ntcaApi.remove(n.id);
    load();
  };

  const handleBulkDelete = async () => {
    const count = selected.size;
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${count} NTCA record${count === 1 ? "" : "s"}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await Promise.all([...selected].map((id) => ntcaApi.remove(id)));
    clearSelection();
    load();
  };

  const handleDeleteAll = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete all ${entries.length} NTCA record${entries.length === 1 ? "" : "s"}?`,
      html: "This permanently deletes every NTCA record, including archived ones, and every NCA Tracker entry drawn against them — not just what's currently filtered or on this page. This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete all", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    const { deleted } = await ntcaApi.clearAll();
    Swal.fire({ icon: "success", title: `Deleted ${deleted} entries`, timer: 1300, showConfirmButton: false, ...swalTheme });
    clearSelection();
    load();
  };

  const handleArchiveToggle = async (n: NTCA) => {
    if (n.is_archived) await ntcaApi.unarchive(n.id);
    else await ntcaApi.archive(n.id);
    load();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const sources = await sheetSyncApi.list("received_ntca");
      if (sources.length === 0) {
        await Swal.fire({
          icon: "info",
          title: "No sheets configured",
          text: "Add at least one Google Sheet URL for Received NTCA first.",
          ...swalTheme,
        });
        return;
      }

      const result = await sheetSyncApi.sync("received_ntca");
      const failedSources = result.sources.filter((s) => s.error);
      const r = result.result;
      const counts = [
        r.created !== undefined ? `${r.created} created` : null,
        r.updated !== undefined ? `${r.updated} updated` : null,
        r.linked !== undefined ? `${r.linked} linked` : null,
        r.cluster_updated ? `${r.cluster_updated} assigned to MDS Regular` : null,
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

  return (
    <AdminLayout title="NTCA Received" subtitle="Track Notices of Transfer of Cash Allocation">
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
          onChange={(e) => setFundClusterFilter(e.target.value as FundCluster | "unclassified" | "")}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 max-w-[220px]"
        >
          <option value="">All Fund Clusters</option>
          <option value="unclassified">Unclassified (no fund cluster yet)</option>
          {FUND_CLUSTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </DateRangeFilterBar>

      <div className="flex items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
        <div className="relative flex-1 max-w-xs sm:max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search NTCA no., SARO no., particulars..."
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
          <Button variant="outline" className="text-foreground" onClick={handleSync} disabled={syncing} title="Sync from Google Sheets">
            <Settings className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
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
            <Plus className="w-4 h-4 mr-2" /> Add Entry
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <KpiStrip cards={[
        {
          title: "Total NTCA",
          value: String(filtered.length),
          caption: filtered.length === entries.length ? undefined : `of ${entries.length} loaded`,
          icon: Scale,
        },
        { title: "Total NTCA Amount", value: formatMoney(filtered.reduce((s, x) => s + Number(x.amount || 0), 0)), icon: FileText },
        { title: "Linked to SARO", value: String(filtered.filter((x) => x.saro_no && saroById.has(x.saro_no)).length), caption: `${filtered.length} total`, icon: Link2 },
        { title: "Unlinked NTCA", value: String(filtered.filter((x) => !x.saro_no || !saroById.has(x.saro_no)).length), icon: Link2Off },
      ]} />

      <BulkActionBar
        count={selected.size}
        itemLabel="NTCA record"
        onDelete={handleBulkDelete}
        onClear={clearSelection}
        extraActions={
          <div className="flex items-center gap-1.5">
            <select
              value={bulkFundCluster}
              onChange={(e) => setBulkFundCluster(e.target.value as FundCluster)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {FUND_CLUSTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Button variant="outline" size="sm" className="text-foreground" onClick={handleBulkSetFundCluster} disabled={settingFundCluster}>
              {settingFundCluster ? "Tagging…" : "Set Fund Cluster"}
            </Button>
          </div>
        }
      />

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[24px_1.2fr_1fr_1.6fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide slg:grid-cols-[24px_1.2fr_1fr_auto]">
              <SelectAllCheckbox checked={isAllSelected(pageIds)} indeterminate={isSomeSelected(pageIds)} onChange={() => toggleAll(pageIds)} />
              <SortFilterHeader label="NTCA No." sortKey="ntca_no" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.ntca_no || ""} onFilterChange={(v) => setColumnFilter("ntca_no", v)} filterPlaceholder="Filter…" />
              <div className="slg:hidden">
                <SortFilterHeader label="NTCA Date" sortKey="date_of_ntca" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                  filterValue={columnFilters.date_of_ntca || ""} onFilterChange={(v) => setColumnFilter("date_of_ntca", v)} filterPlaceholder="Filter…" />
              </div>
              <div className="slg:hidden">
                <SortFilterHeader label="Particulars" sortKey="particulars" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                  filterValue={columnFilters.particulars || ""} onFilterChange={(v) => setColumnFilter("particulars", v)} filterPlaceholder="Filter…" />
              </div>
              <div className="slg:hidden">
                <SortFilterHeader label="SARO No." sortKey="saro_no" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                  filterValue={columnFilters.saro_no || ""} onFilterChange={(v) => setColumnFilter("saro_no", v)} filterPlaceholder="Filter…" />
              </div>
              <SortFilterHeader label="Amount" sortKey="amount" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.amount || ""} onFilterChange={(v) => setColumnFilter("amount", v)} filterPlaceholder="Filter…" />
              <span>Actions</span>
            </div>

            {paginatedData.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">No NTCA records found.</div>
            ) : (
              paginatedData.map((n) => {
                const matchedSaro = n.saro_no ? saroById.get(n.saro_no) : undefined;
                return (
                  <div
                    key={n.id}
                    onClick={() => setViewing(n)}
                    className="grid grid-cols-[24px_1.2fr_1fr_1.6fr_1fr_1fr_auto] gap-4 px-5 py-3.5 border-b border-border last:border-0 items-center hover:bg-accent/40 transition-colors slg:grid-cols-[24px_1.2fr_1fr_auto] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggle(n.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {n.ntca_no}
                        {n.is_archived && <Badge variant="destructive" className="ml-2">archived</Badge>}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate">{n.pap_code || "—"}</p>
                        {n.fund_cluster && (
                          <CategoryChip label={FUND_CLUSTER_OPTIONS.find((o) => o.value === n.fund_cluster)?.label || n.fund_cluster} />
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-foreground slg:hidden">{formatDate(n.date_of_ntca)}</p>
                    <p className="text-sm text-foreground truncate slg:hidden">{n.particulars || "—"}</p>
                    <div className="slg:hidden min-w-0">
                      {n.saro_no ? (
                        matchedSaro ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 truncate">
                            <Link2 className="w-3 h-3 shrink-0" /> {n.saro_no}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground truncate">
                            <Link2Off className="w-3 h-3 shrink-0" /> {n.saro_no}
                          </span>
                        )
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                    <p className="text-sm font-medium text-foreground">{formatMoney(n.amount)}</p>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleEdit(n)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleArchiveToggle(n)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title={n.is_archived ? "Unarchive" : "Archive"}>
                        {n.is_archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => handleDelete(n)} className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
            totalItems={filtered.length}
            onPageSizeChange={setPageSize}
            availablePageSizes={[10, 25, 50, 100]}
          />
        </div>
      )}


      {!loading && (
        <p className="text-xs text-muted-foreground mt-3">Showing {paginatedData.length} of {sorted.length} NTCA records (page {currentPage} of {totalPages})</p>
      )}

      <NtcaFormDialog
        open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={load}
        saroList={saroList} classTypeList={classTypeList} fundSourceList={fundSourceList} papList={papList}
      />
      <NtcaImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />
      <NtcaDetailDialog
        ntca={viewing}
        matchedSaro={viewing?.saro_no ? saroById.get(viewing.saro_no) : undefined}
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />
      <SheetSyncManagerDialog open={sheetSetupOpen} onOpenChange={setSheetSetupOpen} table="received_ntca" label="Received NTCA" onSynced={load} />
    </AdminLayout>
  );
};

export default NtcaPage;
