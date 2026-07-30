import { useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Upload, Trash2, Pencil, Archive, ArchiveRestore, Link2, Link2Off,
  FileText, Wallet, Scale, ChevronDown, ChevronRight, AlertTriangle, Settings,
} from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import { TableSkeleton } from "./Skeleton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { QuickFillSelect } from "../../components/ui/quick-fill-select";
import DateRangeFilterBar from "../../components/filters/DateRangeFilterBar";
import KpiStrip from "../../components/ui/kpi-strip";
import { useDateRangeFilter } from "../../lib/useDateRangeFilter";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import { raodApi, SARO, RaodImportRow } from "../../lib/raodApi";
import { sheetSyncApi } from "../../lib/sheetSyncApi";
import { SheetSyncManagerDialog } from "../../components/admin/SheetSyncManagerDialog";
import { papApi, classTypeApi, fundSourceApi, objectCodeApi, PAP, ClassType, FundSource, ObjectCode } from "../../lib/referenceDataApi";
import { Pagination } from "../../components/ui/pagination";
import { RaodDetailDialog } from "../../components/admin/detail/RaodDetailDialog";
import { RaodGroupDetailDialog } from "../../components/admin/detail/RaodGroupDetailDialog";
import { groupEntriesByObjectCode, groupRaodEntries, groupRaodGroupsByPap, PapGroup } from "../../lib/raodGrouping";
import { BulkActionBar } from "../../components/ui/bulk-action-bar";
import { SelectAllCheckbox } from "../../components/ui/select-all-checkbox";
import { useSelection } from "../../lib/useSelection";
import { Badge } from "../../components/ui/badge";
import { CategoryChip } from "../../components/ui/category-chip";
import { useTableSort, matchesColumnFilters } from "../../lib/useTableSort";
import { SortFilterHeader } from "../../components/ui/sortable-header";

// ── form value shape (everything as strings — that's what inputs give us) ──
interface RaodForm {
  pap: string;
  pap_code: string;
  purpose: string;
  year: string;
  date_of_saro: string;
  saro_no: string;
  amount_of_allotment: string;
  remarks: string;
  object_description: string;
  object_code: string;
  date_of_obligation: string;
  fund_type_description: string;
  class_type: string; // ClassType id, as a string for the <select>
  fund_source: string; // FundSource id, as a string for the <select>
  ors_no: string;
  name_of_claimant: string;
  particulars: string;
  obligated_amount: string;
  date: string;
  ada_check: string;
  cash: string;
  non_tra: string;
  balance: string;
}

const emptyForm = (): RaodForm => ({
  pap: "", pap_code: "", purpose: "", year: "", date_of_saro: "", saro_no: "",
  amount_of_allotment: "", remarks: "", object_description: "", object_code: "",
  date_of_obligation: "", fund_type_description: "", class_type: "", fund_source: "",
  ors_no: "", name_of_claimant: "", particulars: "", obligated_amount: "", date: "",
  ada_check: "", cash: "", non_tra: "", balance: "",
});

const raodToForm = (s: SARO): RaodForm => ({
  pap: s.pap,
  pap_code: s.pap_code,
  purpose: s.purpose,
  year: s.year != null ? String(s.year) : "",
  date_of_saro: s.date_of_saro || "",
  saro_no: s.saro_no,
  amount_of_allotment: s.amount_of_allotment || "",
  remarks: s.remarks,
  object_description: s.object_description,
  object_code: s.object_code,
  date_of_obligation: s.date_of_obligation || "",
  fund_type_description: s.fund_type_description,
  class_type: s.class_type ? String(s.class_type) : "",
  fund_source: s.fund_source ? String(s.fund_source) : "",
  ors_no: s.ors_no,
  name_of_claimant: s.name_of_claimant,
  particulars: s.particulars,
  obligated_amount: s.obligated_amount || "",
  date: s.date || "",
  ada_check: s.ada_check,
  cash: s.cash || "",
  non_tra: s.non_tra || "",
  balance: s.balance || "",
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
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return "Failed to save. Please try again.";
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ");
}

// ─────────────────────────────────────────────────────────────────────────
// Add / Edit dialog — a single, flat RAOD (SARO) record
// ─────────────────────────────────────────────────────────────────────────
function RaodFormDialog({
  open, onOpenChange, editing, onSaved, papList, classTypeList, fundSourceList, objectCodeList,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: SARO | null;
  onSaved: () => void;
  papList: PAP[];
  classTypeList: ClassType[];
  fundSourceList: FundSource[];
  objectCodeList: ObjectCode[];
}) {
  const [form, setForm] = useState<RaodForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(editing ? raodToForm(editing) : emptyForm());
      setError(null);
    }
  }, [open, editing]);

  const update = (field: keyof RaodForm, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.saro_no.trim() || !form.pap_code.trim()) {
      setError("PAP Code and SARO No. are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        pap: form.pap.trim(),
        pap_code: form.pap_code.trim(),
        purpose: form.purpose.trim(),
        year: form.year ? Number(form.year) : null,
        date_of_saro: form.date_of_saro || null,
        saro_no: form.saro_no.trim(),
        amount_of_allotment: form.amount_of_allotment || null,
        remarks: form.remarks.trim(),
        object_description: form.object_description.trim(),
        object_code: form.object_code.trim(),
        date_of_obligation: form.date_of_obligation || null,
        fund_type_description: form.fund_type_description.trim(),
        class_type: form.class_type ? Number(form.class_type) : null,
        fund_source: form.fund_source ? Number(form.fund_source) : null,
        ors_no: form.ors_no.trim(),
        name_of_claimant: form.name_of_claimant.trim(),
        particulars: form.particulars.trim(),
        obligated_amount: form.obligated_amount || null,
        date: form.date || null,
        ada_check: form.ada_check.trim(),
        cash: form.cash || null,
        non_tra: form.non_tra || null,
        balance: form.balance || null,
      };
      if (editing) await raodApi.update(editing.id, payload);
      else await raodApi.create(payload);
      Swal.fire({ icon: "success", title: editing ? "RAOD entry updated" : "RAOD entry added", timer: 1300, showConfirmButton: false, ...swalTheme });
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
          <DialogTitle>{editing ? `Edit ${editing.saro_no}` : "Add RAOD Entry"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          <div className="grid grid-cols-3 gap-4 slg:grid-cols-2 sm:grid-cols-1">
            {field("SARO No. *", <Input value={form.saro_no} onChange={(e) => update("saro_no", e.target.value)} placeholder="2026-01-0031" />)}
            {field("Date of SARO", <Input type="date" value={form.date_of_saro} onChange={(e) => update("date_of_saro", e.target.value)} />)}
            {field("Amount of Allotment", <Input type="number" step="0.01" value={form.amount_of_allotment} onChange={(e) => update("amount_of_allotment", e.target.value)} />)}

            <div className="col-span-2 slg:col-span-1">
              {field("PAP (pick from list, or type manually below)", (
                <QuickFillSelect
                  placeholder="Pick from PAP list…"
                  items={papList}
                  getLabel={(p) => `${p.code} — ${p.name}`}
                  onPick={(p) => { update("pap_code", p.code); update("pap", p.name); }}
                />
              ))}
              <Input className="mt-1.5" placeholder="PAP name" value={form.pap} onChange={(e) => update("pap", e.target.value)} />
            </div>
            {field("PAP Code *", <Input value={form.pap_code} onChange={(e) => update("pap_code", e.target.value)} />)}

            {field("Year", <Input type="number" value={form.year} onChange={(e) => update("year", e.target.value)} />)}
            {field("Object Code", (
              <>
                {/* <QuickFillSelect
                  placeholder="Pick from Object Code list…"
                  items={objectCodeList}
                  getLabel={(oc) => `${oc.code} — ${oc.description}`}
                  onPick={(oc) => { update("object_code", oc.code); update("object_description", oc.description); }}
                /> */}
                <select
                  value={form.object_code}
                  onChange={(e) => {
                    const selectedCode = e.target.value;
                    const selectedObj = objectCodeList.find((oc) => oc.code === selectedCode);
                    update("object_code", selectedCode);
                    update("object_description", selectedObj?.description || "");
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition mt-1.5"
                >
                  <option value="">—</option>
                  {objectCodeList.map((oc) => <option key={oc.id} value={oc.code}>{oc.code}</option>)}
                </select>
              </>
            ),)}
            {field("Object Description", <Input value={form.object_description} onChange={(e) => update("object_description", e.target.value)} />)}

            {field("Class Type", (
              <>
                {/* <QuickFillSelect
                  placeholder="Pick from Class Type list…"
                  items={classTypeList}
                  getLabel={(ct) => `${ct.code} — ${ct.name}`}
                  onPick={(ct) => update("class_type", String(ct.id))}
                /> */}
                <select
                  value={form.class_type}
                  onChange={(e) => update("class_type", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                >
                  <option value="">—</option>
                  {classTypeList.map((ct) => <option key={ct.id} value={ct.id}>{ct.code}</option>)}
                </select>
              </>
            ))}
            <div className="col-span-2 slg:col-span-1">
              {field("Fund Source", (
                <select
                  value={form.fund_source}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selectedFs = fundSourceList.find((fs) => String(fs.id) === selectedId);
                    update("fund_source", selectedId);
                    update("fund_type_description", selectedFs?.name || "");
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                >
                  <option value="">—</option>
                  {fundSourceList.map((fs) => <option key={fs.id} value={fs.id}>{fs.code}</option>)}
                </select>
              ))}
            </div>

            {field("Fund Type Description", <Input value={form.fund_type_description} onChange={(e) => update("fund_type_description", e.target.value)} />)}
            {field("Date of Obligation", <Input type="date" value={form.date_of_obligation} onChange={(e) => update("date_of_obligation", e.target.value)} />)}
            {field("Obligated Amount", <Input type="number" step="0.01" value={form.obligated_amount} onChange={(e) => update("obligated_amount", e.target.value)} />)}

            {field("ORS No.", <Input value={form.ors_no} onChange={(e) => update("ors_no", e.target.value)} />)}
            <div className="col-span-2 slg:col-span-1">
              {field("Name of Claimant", <Input value={form.name_of_claimant} onChange={(e) => update("name_of_claimant", e.target.value)} />)}
            </div>

            {field("Disbursement Date", <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />)}
            {field("ADA/Check", <Input value={form.ada_check} onChange={(e) => update("ada_check", e.target.value)} />)}
            {field("Cash", <Input type="number" step="0.01" value={form.cash} onChange={(e) => update("cash", e.target.value)} />)}
            {field("Non-TRA", <Input type="number" step="0.01" value={form.non_tra} onChange={(e) => update("non_tra", e.target.value)} />)}
            {field("Balance", <Input type="number" step="0.01" value={form.balance} onChange={(e) => update("balance", e.target.value)} />)}

            <div className="col-span-3 slg:col-span-2 sm:col-span-1">
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
// per row (informational only — RAOD rows aren't FK-linked to Received SARO)
// ─────────────────────────────────────────────────────────────────────────
function RaodImportDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<(RaodImportRow & { included: boolean })[] | null>(null);
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
      const result = await raodApi.previewImport(csvText);
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
      const result = await raodApi.confirmImport(rows.filter((r) => r.included));
      Swal.fire({
        icon: "success",
        title: "Import complete",
        text: `${result.created} RAOD row(s) created.`,
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
          <DialogTitle>Bulk Import RAOD</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Paste CSV content (including the header row — PAP, PAP Code, Date of SARO, SARO No., Amount of Allotment, ...)
            </label>
            <textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setRows(null); }}
              rows={8}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              placeholder="PAP,PAP CODE,DATE OF SARO,SARO NO,AMOUNT OF ALLOTMENT, ..."
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
                  <span>SARO No. / Object</span>
                  <span>PAP Code</span>
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
                      <p className="font-medium text-foreground truncate">{r.saro_no} — {r.object_description || "(no object description)"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDate(r.date_of_saro)} · row {r.row_number}{r.is_duplicate && " · looks already imported"}
                      </p>
                    </div>
                    <span className="text-xs text-foreground truncate">{r.pap_code || "—"}</span>
                    <span className="text-xs text-foreground">{formatMoney(r.amount_of_allotment)}</span>
                    {r.saro_match ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 w-fit">
                        <Link2 className="w-3 h-3" /> #{r.saro_match.id} {r.saro_match.pap_name || r.saro_match.saro_no}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground w-fit">
                        <Link2Off className="w-3 h-3" /> No SARO — informational only
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
const RaodPage = () => {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<SARO[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<SARO | null>(null);
  const [viewing, setViewing] = useState<SARO | null>(null);
  const [viewingGroup, setViewingGroup] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [papFilter, setPapFilter] = useState("");
  const [fundTypeFilter, setFundTypeFilter] = useState("");
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [papList, setPapList] = useState<PAP[]>([]);
  const [classTypeList, setClassTypeList] = useState<ClassType[]>([]);
  const [fundSourceList, setFundSourceList] = useState<FundSource[]>([]);
  const [objectCodeList, setObjectCodeList] = useState<ObjectCode[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      setEntries(await raodApi.list({ archived: showArchived }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  useEffect(() => {
    papApi.list().then(setPapList);
    classTypeApi.list().then(setClassTypeList);
    fundSourceApi.list().then(setFundSourceList);
    objectCodeApi.list().then(setObjectCodeList);
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    entries.forEach((s) => { if (s.date_of_saro) years.add(Number(s.date_of_saro.slice(0, 4))); });
    return Array.from(years).sort((a, b) => b - a);
  }, [entries]);

  const papOptions = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((s) => { if (s.pap_code) map.set(s.pap_code, s.pap || s.pap_code); });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const fundTypeOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((s) => { if (s.fund_type_description) set.add(s.fund_type_description); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const {
    year, quarter, dateFrom, dateTo,
    setYear, applyQuarter, setDateFrom, setDateTo,
    clear: clearDateFilters, inRange, hasActiveDateFilter,
  } = useDateRangeFilter(availableYears);

  const clearFilters = () => {
    clearDateFilters(); setPapFilter(""); setFundTypeFilter(""); setSearch(""); setCurrentPage(1);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((s) => {
      if (s.date_of_saro && !inRange(s.date_of_saro)) return false;
      if (papFilter && s.pap_code !== papFilter) return false;
      if (fundTypeFilter && s.fund_type_description !== fundTypeFilter) return false;
      if (!q) return true;
      return (
        s.saro_no.toLowerCase().includes(q) ||
        s.pap.toLowerCase().includes(q) ||
        s.pap_code.toLowerCase().includes(q) ||
        s.object_code.toLowerCase().includes(q) ||
        s.ors_no.toLowerCase().includes(q)
      );
    });
  }, [entries, search, papFilter, fundTypeFilter, inRange]);

  // RAOD entries aren't linked server-side, but many share a SARO No. —
  // group them client-side so the table reads as one accordion row per
  // SARO No. (mirroring how Received SARO already groups its line items).
  const groups = useMemo(() => groupRaodEntries(filtered), [filtered]);

  // One level up: bucket those SARO-No. groups by PAP/Project, so the table
  // reads as PAP → SARO No. → Object Code → entry.
  const papGroups = useMemo(() => groupRaodGroupsByPap(groups), [groups]);

  // Per-column sort + filter on the PAP-level table (the header row) — on
  // top of the date/PAP/fund-type/search filters above.
  const { sortKey, sortDir, toggleSort, applySort } = useTableSort<PapGroup>((row, key) => {
    switch (key) {
      case "pap": return row.pap || row.pap_code;
      case "saroCount": return row.saroGroups.length;
      case "allotment": return row.totalAllotment;
      case "obligated": return row.totalObligated;
      default: return null;
    }
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const setColumnFilter = (key: string, value: string) => setColumnFilters((prev) => ({ ...prev, [key]: value }));

  const papGroupsFiltered = useMemo(
    () => papGroups.filter((row) => matchesColumnFilters(row, columnFilters, (r, key) => {
      switch (key) {
        case "pap": return `${r.pap} ${r.pap_code}`;
        case "saroCount": return String(r.saroGroups.length);
        case "allotment": return formatMoney(r.totalAllotment);
        case "obligated": return formatMoney(r.totalObligated);
        default: return "";
      }
    })),
    [papGroups, columnFilters]
  );
  const papGroupsSorted = useMemo(() => applySort(papGroupsFiltered), [papGroupsFiltered, sortKey, sortDir]);

  // Pagination — paginate over PAP groups, not individual records
  const totalPages = Math.ceil(papGroupsSorted.length / pageSize);
  const paginatedPapGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return papGroupsSorted.slice(start, start + pageSize);
  }, [papGroupsSorted, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, papFilter, fundTypeFilter, inRange, columnFilters, papGroupsSorted.length]);

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Selection is per individual RAOD (object-code) record — that's the
  // deletable unit — flattened across every group on the current page, not
  // just the ones currently expanded.
  const pageEntryIds = useMemo(
    () => paginatedPapGroups.flatMap((p) => p.saroGroups.flatMap((g) => g.entries.map((e) => e.id))),
    [paginatedPapGroups]
  );
  const { selected, toggle, toggleAll, clear: clearSelection, isAllSelected, isSomeSelected } = useSelection<number>();

  const handleDelete = async (s: SARO) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${s.saro_no}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await raodApi.remove(s.id);
    load();
  };

  const handleBulkDelete = async () => {
    const count = selected.size;
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${count} RAOD record${count === 1 ? "" : "s"}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await Promise.all([...selected].map((id) => raodApi.remove(id)));
    clearSelection();
    load();
  };

  const handleDeleteAll = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete all ${entries.length} RAOD record${entries.length === 1 ? "" : "s"}?`,
      html: "This permanently deletes every RAOD row, including archived ones — not just what's currently filtered or on this page. This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete all", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    const { deleted } = await raodApi.clearAll();
    Swal.fire({ icon: "success", title: `Deleted ${deleted} entries`, timer: 1300, showConfirmButton: false, ...swalTheme });
    clearSelection();
    load();
  };

  const handleArchiveToggle = async (s: SARO) => {
    if (s.is_archived) await raodApi.unarchive(s.id);
    else await raodApi.archive(s.id);
    load();
  };

  const [syncing, setSyncing] = useState(false);
  const [sheetSetupOpen, setSheetSetupOpen] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await sheetSyncApi.sync('raod');
      const failedSources = result.sources.filter((s) => s.error);
      const counts = [
        result.result.created !== undefined ? `${result.result.created} created` : null,
        result.result.updated !== undefined ? `${result.result.updated} updated` : null,
        result.result.line_items_written !== undefined ? `${result.result.line_items_written} line items` : null,
      ].filter(Boolean).join(', ');

      await Swal.fire({
        icon: failedSources.length > 0 ? 'warning' : 'success',
        title: 'Sync complete',
        html: `
          <p style="margin-bottom:8px">${counts || 'Nothing new.'}</p>
          ${failedSources.length > 0
            ? `<p style="color:#dc2626;font-size:13px">${failedSources.length} sheet(s) failed:</p><ul style="text-align:left;font-size:12px">${failedSources.map((s) => `<li>${s.label || s.url}: ${s.error}</li>`).join('')}</ul>`
            : ''}
          ${result.warnings.length > 0
            ? `<p style="font-size:12px;margin-top:8px">${result.warnings.length} warning(s) — check the affected rows.</p>`
            : ''}
        `,
        ...swalTheme,
      });
      load();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Sync failed', text: extractError(err), ...swalTheme });
    } finally {
      setSyncing(false);
    }
  };

  const handleAdd = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (s: SARO) => { setEditing(s); setFormOpen(true); };

  return (
    <AdminLayout title="RAOD" subtitle="Registry of Allotment, Obligation and Disbursement">
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
        hasActiveFilters={hasActiveDateFilter || !!papFilter || !!fundTypeFilter || !!search}
      >
        <select
          value={papFilter}
          onChange={(e) => setPapFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 max-w-[220px]"
        >
          <option value="">All PAP / Projects</option>
          {papOptions.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
        <select
          value={fundTypeFilter}
          onChange={(e) => setFundTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 max-w-[220px]"
        >
          <option value="">All Fund Types</option>
          {fundTypeOptions.map((ft) => <option key={ft} value={ft}>{ft}</option>)}
        </select>
      </DateRangeFilterBar>

      <div className="flex items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
        <div className="relative flex-1 max-w-xs sm:max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search SARO no., PAP, object code, ORS no..."
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
            <Settings className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Sheets'}
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

      {/* KPI Strip */}
      <KpiStrip cards={[
        { title: "Total Allotment", value: formatMoney(filtered.reduce((s, x) => s + Number(x.amount_of_allotment || 0), 0)), icon: FileText },
        { title: "Total Obligated", value: formatMoney(filtered.reduce((s, x) => s + Number(x.obligated_amount || 0), 0)), icon: Wallet },
        { title: "Total Disbursed", value: formatMoney(filtered.reduce((s, x) => s + Number(x.cash || 0) + Number(x.non_tra || 0), 0)), icon: Scale },
        { title: "Unobligated", value: formatMoney(filtered.reduce((s, x) => s + Number(x.balance || 0), 0)), icon: FileText },
      ]} />

      <BulkActionBar count={selected.size} itemLabel="RAOD record" onDelete={handleBulkDelete} onClear={clearSelection} />

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[24px_24px_1.4fr_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide slg:grid-cols-[24px_24px_1.4fr_auto]">
            <SelectAllCheckbox checked={isAllSelected(pageEntryIds)} indeterminate={isSomeSelected(pageEntryIds)} onChange={() => toggleAll(pageEntryIds)} />
            <span />
            <SortFilterHeader label="PAP / Project" sortKey="pap" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.pap || ""} onFilterChange={(v) => setColumnFilter("pap", v)} filterPlaceholder="Filter PAP…" />
            <div className="slg:hidden">
              <SortFilterHeader label="SARO No.(s)" sortKey="saroCount" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.saroCount || ""} onFilterChange={(v) => setColumnFilter("saroCount", v)} filterPlaceholder="Filter…" />
            </div>
            <div className="slg:hidden">
              <SortFilterHeader label="Allotment" sortKey="allotment" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.allotment || ""} onFilterChange={(v) => setColumnFilter("allotment", v)} filterPlaceholder="Filter…" />
            </div>
            <SortFilterHeader label="Obligated" sortKey="obligated" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.obligated || ""} onFilterChange={(v) => setColumnFilter("obligated", v)} filterPlaceholder="Filter…" />
          </div>

          {paginatedPapGroups.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No RAOD records found.</div>
          ) : (
            paginatedPapGroups.map((p) => {
              const papIds = p.saroGroups.flatMap((g) => g.entries.map((e) => e.id));
              const papKey = `pap::${p.key}`;
              return (
                <div key={papKey}>
                  <div
                    onClick={() => toggleExpanded(papKey)}
                    className="grid grid-cols-[24px_24px_1.4fr_1fr_1fr_1fr] gap-4 px-5 py-3.5 border-b border-border items-center hover:bg-accent/40 transition-colors slg:grid-cols-[24px_24px_1.4fr_auto] cursor-pointer"
                  >
                    <SelectAllCheckbox
                      checked={isAllSelected(papIds)}
                      indeterminate={isSomeSelected(papIds)}
                      onChange={() => toggleAll(papIds)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button onClick={(e) => { e.stopPropagation(); toggleExpanded(papKey); }} className="text-muted-foreground hover:text-foreground transition">
                      {expanded.has(papKey) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {p.pap || "(no PAP)"}
                        {p.allArchived && <Badge variant="destructive" className="ml-2">archived</Badge>}
                      </p>
                      <div className="mt-0.5"><CategoryChip label={p.pap_code} /></div>
                    </div>
                    <div className="slg:hidden"><Badge variant="secondary">{p.saroGroups.length} SARO{p.saroGroups.length === 1 ? "" : "s"}</Badge></div>
                    <p className="text-sm text-foreground slg:hidden">{formatMoney(p.totalAllotment)}</p>
                    <p className="text-sm font-medium text-foreground">{formatMoney(p.totalObligated)}</p>
                  </div>

                  {expanded.has(papKey) && (
                    <div className="pl-6 pr-0 bg-muted/10 border-b border-border">
                      {p.saroGroups.map((g) => {
                        const groupIds = g.entries.map((e) => e.id);
                        return (
                          <div key={g.key} className="border-b border-border last:border-0">
                            <div
                              onClick={() => setViewingGroup(g.key)}
                              className="grid grid-cols-[24px_24px_1.2fr_1fr_1fr] gap-4 pl-3 pr-5 py-3 items-center hover:bg-accent/40 transition-colors cursor-pointer"
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
                                <p className="text-sm font-medium text-foreground truncate">
                                  {g.saro_no || "(no SARO No.)"}
                                  {g.allArchived && <Badge variant="destructive" className="ml-2">archived</Badge>}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">{formatDate(g.date_of_saro)}</p>
                              </div>
                              <div className="slg:hidden"><Badge variant="secondary">{g.entries.length} object code{g.entries.length === 1 ? "" : "s"}</Badge></div>
                              <p className="text-sm font-medium text-foreground">{formatMoney(g.totalAllotment)}</p>
                            </div>

                            {expanded.has(g.key) && (
                              <div className="px-5 py-3 bg-muted/20 border-t border-border">
                                <div className="overflow-x-auto">
                                  <div className="min-w-[860px] border border-border rounded-lg overflow-hidden">
                                    <div className="grid grid-cols-[24px_24px_100px_1.5fr_120px_120px_120px] gap-2 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      <span />
                                      <span />
                                      <span>Object Code</span>
                                      <span>Description</span>
                                      <span>Allotment</span>
                                      <span>Obligated</span>
                                      <span>Balance</span>
                                    </div>
                                    {groupEntriesByObjectCode(g.entries).map((code) => {
                                      const codeKey = `${g.key}::obj::${code.object_code}`;
                                      const codeIds = code.entries.map((e) => e.id);
                                      return (
                                        <div key={codeKey}>
                                          <div
                                            onClick={() => toggleExpanded(codeKey)}
                                            className="grid grid-cols-[24px_24px_100px_1.5fr_120px_120px_120px] gap-2 px-3 py-2.5 border-b border-border last:border-0 items-center text-xs hover:bg-accent/40 transition-colors cursor-pointer"
                                          >
                                            <SelectAllCheckbox
                                              checked={isAllSelected(codeIds)}
                                              indeterminate={isSomeSelected(codeIds)}
                                              onChange={() => toggleAll(codeIds)}
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                            <button onClick={(e) => { e.stopPropagation(); toggleExpanded(codeKey); }} className="text-muted-foreground hover:text-foreground transition">
                                              {expanded.has(codeKey) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                            </button>
                                            <div className="min-w-0"><CategoryChip label={code.object_code} /></div>
                                            <span className="text-foreground truncate">
                                              {code.object_description || "—"}
                                              {code.entries.length > 1 && <Badge variant="secondary" className="ml-2">{code.entries.length} entries</Badge>}
                                            </span>
                                            <span className="text-foreground">{formatMoney(code.amount_of_allotment)}</span>
                                            <span className="text-foreground">{formatMoney(code.obligated_amount)}</span>
                                            <span className="text-foreground">{formatMoney(code.balance)}</span>
                                          </div>

                                          {expanded.has(codeKey) && (
                                            <div className="pl-8 pr-3 py-2 bg-background border-b border-border">
                                              <div className="border border-border rounded-lg overflow-hidden">
                                                <div className="grid grid-cols-[24px_1.5fr_110px_120px_120px_120px_auto] gap-2 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                  <span />
                                                  <span>Description</span>
                                                  <span>Fund Type</span>
                                                  <span>Allotment</span>
                                                  <span>Obligated</span>
                                                  <span>Balance</span>
                                                  <span>Actions</span>
                                                </div>
                                                {code.entries.map((s) => (
                                                  <div
                                                    key={s.id}
                                                    onClick={() => setViewing(s)}
                                                    className="grid grid-cols-[24px_1.5fr_110px_120px_120px_120px_auto] gap-2 px-3 py-2.5 border-b border-border last:border-0 items-center text-xs hover:bg-accent/40 transition-colors cursor-pointer"
                                                  >
                                                    <input
                                                      type="checkbox"
                                                      checked={selected.has(s.id)}
                                                      onChange={() => toggle(s.id)}
                                                      onClick={(e) => e.stopPropagation()}
                                                    />
                                                    <span className="text-foreground truncate">
                                                      {s.object_description || "—"}
                                                      {s.is_archived && <Badge variant="destructive" className="ml-2">archived</Badge>}
                                                    </span>
                                                    <div className="min-w-0"><CategoryChip label={s.fund_type_description} /></div>
                                                    <span className="text-foreground">{formatMoney(s.amount_of_allotment)}</span>
                                                    <span className="text-foreground">{formatMoney(s.obligated_amount)}</span>
                                                    <span className="text-foreground">{formatMoney(s.balance)}</span>
                                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                      <button onClick={() => handleEdit(s)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                      </button>
                                                      <button onClick={() => handleArchiveToggle(s)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title={s.is_archived ? "Unarchive" : "Archive"}>
                                                        {s.is_archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                                                      </button>
                                                      <button onClick={() => handleDelete(s)} className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      )}

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        totalItems={papGroups.length}
        onPageSizeChange={setPageSize}
        availablePageSizes={[10, 25, 50, 100]}
      />

      {!loading && (
        <p className="text-xs text-muted-foreground mt-3">Showing {paginatedPapGroups.length} of {papGroupsSorted.length} PAP/Project group(s) — {groups.length} SARO No. group(s), {filtered.length} RAOD record(s) total (page {currentPage} of {totalPages})</p>
      )}

      <RaodFormDialog
        open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={load}
        papList={papList} classTypeList={classTypeList} fundSourceList={fundSourceList}
        objectCodeList={objectCodeList}
      />
      <RaodImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />
      <SheetSyncManagerDialog open={sheetSetupOpen} onOpenChange={setSheetSetupOpen} table="raod" label="RAOD" onSynced={load} />
      <RaodDetailDialog saro={viewing} open={!!viewing} onOpenChange={(open) => !open && setViewing(null)} />
      <RaodGroupDetailDialog
        group={groups.find((g) => g.key === viewingGroup) || null}
        open={!!viewingGroup}
        onOpenChange={(open) => !open && setViewingGroup(null)}
      />
    </AdminLayout>
  );
};

export default RaodPage;
