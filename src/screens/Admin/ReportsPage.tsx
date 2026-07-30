import { useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Trash2, Pencil, Archive, ArchiveRestore, X, Download, ClipboardPaste, FileSpreadsheet,
} from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import { TableSkeleton } from "./Skeleton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import KpiStrip from "../../components/ui/kpi-strip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import { Pagination } from "../../components/ui/pagination";
import { BulkActionBar } from "../../components/ui/bulk-action-bar";
import { SelectAllCheckbox } from "../../components/ui/select-all-checkbox";
import { useSelection } from "../../lib/useSelection";
import { downloadCsv } from "../../lib/csvExport";
import { generateReportWorkbook } from "../../lib/reportWorkbook";
import { radaiApi, RADAI_MDS_TYPE_OPTIONS } from "../../lib/radaiApi";
import { rciApi, RCI_MDS_TYPE_OPTIONS } from "../../lib/rciApi";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

function extractError(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return "Failed to save. Please try again.";
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ");
}

const sumAmountLines = (value: string): number =>
  String(value || "").split("\n").map((l) => parseFloat(l.trim().replace(/,/g, "")) || 0).reduce((s, n) => s + n, 0);

const formatMoney = (value: string | number | null | undefined): string => {
  const n = typeof value === "number" ? value : sumAmountLines(String(value ?? ""));
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Accepts YYYY-MM-DD (already correct), MM/DD/YYYY or M/D/YYYY (US/Excel
// default), and DD-MM-YYYY — whichever a pasted spreadsheet cell happens to
// use — and normalizes to the ISO form Django's DateField requires.
// Returns "" if the text can't be recognized as any of those.
function parseDate(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dashMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, d, m, y] = dashMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

// Strips thousands-separator commas and surrounding whitespace from a
// pasted amount cell, keeping it as a clean numeric string (or "" if it
// wasn't actually a number).
function cleanAmountLine(raw: string): string {
  return raw.split("\n").map((line) => {
    const n = parseFloat(line.trim().replace(/,/g, ""));
    return Number.isNaN(n) ? "" : String(n);
  }).filter(Boolean).join("\n");
}

interface PasteImportEntry {
  date: string;
  serial_no: string;
  dv_payroll_no: string;
  ors_burs_no: string;
  responsibility_center_code: string;
  payee: string;
  uacs_object_code: string;
  nature_of_payment: string;
  amount: string;
}

const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "2-digit", day: "2-digit" });
};

// ─────────────────────────────────────────────────────────────────────────
// Shared row shape both RADAI and RCI entries fit into. The only thing
// that differs between them is the "from/to" serial-range field name
// (ada_nos_from/to vs check_nos_from/to) and the mds_type option set —
// everything else lines up exactly (see saro/models.py ReportEntryBase on
// the backend), so one generic table implementation covers both.
// ─────────────────────────────────────────────────────────────────────────
interface ReportRow {
  id: number;
  mds_type: string;
  date: string;
  serial_no: string;
  dv_payroll_no: string;
  ors_burs_no: string;
  responsibility_center_code: string;
  payee: string;
  uacs_object_code: string;
  nature_of_payment: string;
  amount: string;
  period_covered: string;
  entity_name: string;
  fund_cluster: string;
  bank_name_account_no: string;
  report_no: string;
  sheet_no: string;
  prepared_by_name: string;
  prepared_by_position: string;
  certified_by_name: string;
  certified_by_position: string;
  is_archived: boolean;
  [rangeFrom: string]: unknown;
}

interface ReportConfig {
  kind: "radai" | "rci";
  label: string;
  mdsTypeOptions: { value: string; label: string }[];
  rangeFromKey: string;
  rangeToKey: string;
  rangeLabel: string;
  rangeCertNoun: string;
  topRightLabel: string;
  workbookTitle: string;
  totalLabel: string;
  api: {
    list: (params?: { search?: string; archived?: boolean; mds_type?: string; month?: string }) => Promise<ReportRow[]>;
    create: (payload: Record<string, unknown>) => Promise<ReportRow>;
    update: (id: number, payload: Record<string, unknown>) => Promise<ReportRow>;
    remove: (id: number) => Promise<void>;
    archive: (id: number) => Promise<ReportRow>;
    unarchive: (id: number) => Promise<ReportRow>;
    bulkDelete: (ids: number[]) => Promise<{ deleted: number }>;
    bulkArchive: (ids: number[], archived: boolean) => Promise<{ updated: number }>;
  };
}

const RADAI_CONFIG: ReportConfig = {
  kind: "radai",
  label: "RADAI",
  mdsTypeOptions: RADAI_MDS_TYPE_OPTIONS,
  rangeFromKey: "ada_nos_from",
  rangeToKey: "ada_nos_to",
  rangeLabel: "ADA Nos.",
  rangeCertNoun: "ADA Nos.",
  topRightLabel: "GAM Appendix 13- RX",
  workbookTitle: "REPORT OF ADVICE TO DEBIT ACCOUNT ISSUED",
  totalLabel: "Total",
  api: radaiApi as unknown as ReportConfig["api"],
};

const RCI_CONFIG: ReportConfig = {
  kind: "rci",
  label: "RCI",
  mdsTypeOptions: RCI_MDS_TYPE_OPTIONS,
  rangeFromKey: "check_nos_from",
  rangeToKey: "check_nos_to",
  rangeLabel: "Check Nos.",
  rangeCertNoun: "CHECKS Nos.",
  topRightLabel: "External Document",
  workbookTitle: "REPORT OF CHECKS ISSUED",
  totalLabel: "TOTAL",
  api: rciApi as unknown as ReportConfig["api"],
};

const emptyForm = (config: ReportConfig): Record<string, string> => ({
  mds_type: config.mdsTypeOptions[0].value,
  date: "", serial_no: "", dv_payroll_no: "", ors_burs_no: "", responsibility_center_code: "",
  payee: "", uacs_object_code: "", nature_of_payment: "", amount: "",
  entity_name: "", fund_cluster: "", bank_name_account_no: "", report_no: "", sheet_no: "",
  prepared_by_name: "", prepared_by_position: "", certified_by_name: "", certified_by_position: "",
  [config.rangeFromKey]: "", [config.rangeToKey]: "",
});

const rowToForm = (config: ReportConfig, row: ReportRow): Record<string, string> => ({
  mds_type: row.mds_type,
  date: row.date, serial_no: row.serial_no, dv_payroll_no: row.dv_payroll_no, ors_burs_no: row.ors_burs_no,
  responsibility_center_code: row.responsibility_center_code, payee: row.payee, uacs_object_code: row.uacs_object_code,
  nature_of_payment: row.nature_of_payment, amount: row.amount,
  entity_name: row.entity_name, fund_cluster: row.fund_cluster, bank_name_account_no: row.bank_name_account_no,
  report_no: row.report_no, sheet_no: row.sheet_no,
  prepared_by_name: row.prepared_by_name, prepared_by_position: row.prepared_by_position,
  certified_by_name: row.certified_by_name, certified_by_position: row.certified_by_position,
  [config.rangeFromKey]: String(row[config.rangeFromKey] ?? ""),
  [config.rangeToKey]: String(row[config.rangeToKey] ?? ""),
});

// ─────────────────────────────────────────────────────────────────────────
// Add / Edit dialog — one shared form for both RADAI and RCI, since every
// field lines up except the mds_type options and the range-field name.
// ─────────────────────────────────────────────────────────────────────────
function EntryFormDialog({
  open, onOpenChange, config, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ReportConfig;
  editing: ReportRow | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(emptyForm(config));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(editing ? rowToForm(config, editing) : emptyForm(config));
      setError(null);
    }
  }, [open, editing, config]);

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.date || !form.serial_no.trim() || !form.payee.trim()) {
      setError("Date, Serial No., and Payee are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) await config.api.update(editing.id, form);
      else await config.api.create(form);
      Swal.fire({ icon: "success", title: editing ? `${config.label} entry updated` : `${config.label} entry added`, timer: 1200, showConfirmButton: false, ...swalTheme });
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
          <DialogTitle>{editing ? `Edit ${config.label} Entry` : `Add ${config.label} Entry`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>}

          <div className="grid grid-cols-3 gap-4 sm:grid-cols-1">
            {field("Type", (
              <select value={form.mds_type} onChange={(e) => update("mds_type", e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                {config.mdsTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ))}
            {field("Date *", <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />)}
            {field("Serial No. *", <Input value={form.serial_no} onChange={(e) => update("serial_no", e.target.value)} />)}
          </div>

          <div className="grid grid-cols-3 gap-4 sm:grid-cols-1">
            {field("DV / Payroll No.", <Input value={form.dv_payroll_no} onChange={(e) => update("dv_payroll_no", e.target.value)} />)}
            {field("RC Code", <Input value={form.responsibility_center_code} onChange={(e) => update("responsibility_center_code", e.target.value)} />)}
            {field("Payee *", <Input value={form.payee} onChange={(e) => update("payee", e.target.value)} />)}
          </div>

          {field("ORS / BURS No. (one per line for multiple splits)", (
            <textarea rows={2} value={form.ors_burs_no} onChange={(e) => update("ors_burs_no", e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
          ))}
          {field("UACS Object Code (one per line for multiple splits)", (
            <textarea rows={2} value={form.uacs_object_code} onChange={(e) => update("uacs_object_code", e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
          ))}
          {field("Amount (one per line, matching UACS lines)", (
            <textarea rows={2} value={form.amount} onChange={(e) => update("amount", e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
          ))}
          {field("Nature of Payment", (
            <Input value={form.nature_of_payment} onChange={(e) => update("nature_of_payment", e.target.value)} />
          ))}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-1 pt-2 border-t border-border">
            {field("Entity Name", <Input value={form.entity_name} onChange={(e) => update("entity_name", e.target.value)} />)}
            {field("Fund Cluster", <Input value={form.fund_cluster} onChange={(e) => update("fund_cluster", e.target.value)} />)}
            {field("Bank / Account No.", <Input value={form.bank_name_account_no} onChange={(e) => update("bank_name_account_no", e.target.value)} />)}
            {field("Report No.", <Input value={form.report_no} onChange={(e) => update("report_no", e.target.value)} />)}
            {field("Sheet No.", <Input value={form.sheet_no} onChange={(e) => update("sheet_no", e.target.value)} />)}
            <div className="grid grid-cols-2 gap-2">
              {field(`${config.rangeLabel} From`, <Input value={form[config.rangeFromKey]} onChange={(e) => update(config.rangeFromKey, e.target.value)} />)}
              {field(`${config.rangeLabel} To`, <Input value={form[config.rangeToKey]} onChange={(e) => update(config.rangeToKey, e.target.value)} />)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-1 pt-2 border-t border-border">
            {field("Prepared By", <Input value={form.prepared_by_name} onChange={(e) => update("prepared_by_name", e.target.value)} />)}
            {field("Prepared By — Position", <Input value={form.prepared_by_position} onChange={(e) => update("prepared_by_position", e.target.value)} />)}
            {field("Certified By", <Input value={form.certified_by_name} onChange={(e) => update("certified_by_name", e.target.value)} />)}
            {field("Certified By — Position", <Input value={form.certified_by_position} onChange={(e) => update("certified_by_position", e.target.value)} />)}
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
// Paste Import dialog — pastes tab-separated rows (Date, Serial No.,
// DV/Payroll No., ORS/BURS No., RC Code, Payee, UACS Object Code,
// Nature of Payment, Amount), one entry per line.
// ─────────────────────────────────────────────────────────────────────────
function PasteImportDialog({
  open, onOpenChange, config, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ReportConfig;
  onImported: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setRaw(""); setError(null); }
  }, [open]);

  const rawRows = useMemo(() => {
    return raw.split("\n").map((line) => line.split("\t")).filter((cols) => cols.some((c) => c.trim()));
  }, [raw]);

  // Continuation rows (extra UACS/Amount splits for the previous entry —
  // no Serial No. of their own, since every real entry has one) get folded
  // into the entry above them instead of becoming their own row.
  const entries = useMemo(() => {
    const result: PasteImportEntry[] = [];
    for (const cols of rawRows) {
      const [date, serial_no, dv_payroll_no, ors_burs_no, responsibility_center_code, payee, uacs_object_code, nature_of_payment, amount] = cols;
      const isContinuation = !(serial_no || "").trim() && result.length > 0;
      if (isContinuation) {
        const prev = result[result.length - 1];
        if ((uacs_object_code || "").trim()) prev.uacs_object_code += `\n${uacs_object_code.trim()}`;
        if ((amount || "").trim()) prev.amount += `\n${cleanAmountLine(amount)}`;
        if ((ors_burs_no || "").trim()) prev.ors_burs_no += `\n${ors_burs_no.trim()}`;
        continue;
      }
      result.push({
        date: parseDate((date || "").trim()),
        serial_no: (serial_no || "").trim(),
        dv_payroll_no: (dv_payroll_no || "").trim(),
        ors_burs_no: (ors_burs_no || "").trim(),
        responsibility_center_code: (responsibility_center_code || "").trim(),
        payee: (payee || "").trim(),
        uacs_object_code: (uacs_object_code || "").trim(),
        nature_of_payment: (nature_of_payment || "").trim(),
        amount: cleanAmountLine(amount || ""),
      });
    }
    return result;
  }, [rawRows]);

  const handleImport = async () => {
    if (entries.length === 0) { setError("Paste at least one row first."); return; }
    const missingDate = entries.find((e) => !e.date);
    if (missingDate) { setError(`Couldn't recognize the date for "${missingDate.serial_no || missingDate.payee}" — use YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY.`); return; }
    setImporting(true);
    setError(null);
    try {
      for (const entry of entries) {
        await config.api.create({
          mds_type: config.mdsTypeOptions[0].value,
          ...entry,
          entity_name: "", fund_cluster: "", bank_name_account_no: "", report_no: "", sheet_no: "",
          prepared_by_name: "", prepared_by_position: "", certified_by_name: "", certified_by_position: "",
          [config.rangeFromKey]: "", [config.rangeToKey]: "",
        });
      }
      Swal.fire({ icon: "success", title: `Imported ${entries.length} ${config.label} entr${entries.length === 1 ? "y" : "ies"}`, timer: 1500, showConfirmButton: false, ...swalTheme });
      onImported();
      onOpenChange(false);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Paste Import — {config.label}</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 flex flex-col gap-3">
          {error && <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>}
          <p className="text-xs text-muted-foreground">
            Paste rows copied from a spreadsheet — one entry per line, tab-separated, in this column order:
            Date, Serial No., DV/Payroll No., ORS/BURS No., RC Code, Payee, UACS Object Code, Nature of Payment, Amount.
          </p>
          <textarea
            rows={10}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste spreadsheet rows here…"
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-muted-foreground">{entries.length} entr{entries.length === 1 ? "y" : "ies"} detected{rawRows.length > entries.length ? ` (${rawRows.length - entries.length} continuation row(s) merged in)` : ""}.</p>
        </div>
        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button onClick={handleImport} disabled={importing || entries.length === 0}>{importing ? "Importing…" : `Import ${entries.length || ""}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Generate Report dialog — builds the official .xlsx template (one
// worksheet per mds_type present in the filtered entries) via reportWorkbook.ts.
// Report-level fields (entity/fund cluster/bank/signatories/range) are
// editable here since they're meant to apply to the whole generated report,
// not stored per-row; defaults are remembered per report kind in
// localStorage so they don't need retyping every time.
// ─────────────────────────────────────────────────────────────────────────
interface ReportDefaults {
  entity_name: string;
  prepared_by_name: string;
  prepared_by_position: string;
  certified_by_name: string;
  certified_by_position: string;
  // one fund cluster / bank account pair per mds_type value
  per_type: Record<string, { fund_cluster: string; bank_name_account_no: string }>;
}

function loadReportDefaults(config: ReportConfig): ReportDefaults {
  try {
    const raw = localStorage.getItem(`efas_report_defaults_${config.kind}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore malformed storage */ }
  return {
    entity_name: "", prepared_by_name: "", prepared_by_position: "",
    certified_by_name: "", certified_by_position: "", per_type: {},
  };
}

function saveReportDefaults(config: ReportConfig, defaults: ReportDefaults) {
  localStorage.setItem(`efas_report_defaults_${config.kind}`, JSON.stringify(defaults));
}

function GenerateReportDialog({
  open, onOpenChange, config, entries,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ReportConfig;
  entries: ReportRow[];
}) {
  const [defaults, setDefaults] = useState<ReportDefaults>(() => loadReportDefaults(config));
  const [reportNo, setReportNo] = useState("");
  const [sheetNo, setSheetNo] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      setDefaults(loadReportDefaults(config));
      setReportNo(""); setSheetNo(""); setRangeFrom(""); setRangeTo("");
    }
  }, [open, config]);

  const presentTypes = useMemo(
    () => config.mdsTypeOptions.filter((o) => entries.some((e) => e.mds_type === o.value)),
    [config, entries]
  );
  const period = entries[0]?.period_covered || "";

  const updateDefault = (
    key: "entity_name" | "prepared_by_name" | "prepared_by_position" | "certified_by_name" | "certified_by_position",
    value: string
  ) => setDefaults((prev) => ({ ...prev, [key]: value }));
  const updatePerType = (mdsType: string, field: "fund_cluster" | "bank_name_account_no", value: string) =>
    setDefaults((prev) => ({
      ...prev,
      per_type: {
        ...prev.per_type,
        [mdsType]: {
          fund_cluster: field === "fund_cluster" ? value : (prev.per_type[mdsType]?.fund_cluster || ""),
          bank_name_account_no: field === "bank_name_account_no" ? value : (prev.per_type[mdsType]?.bank_name_account_no || ""),
        },
      },
    }));

  const handleGenerate = async () => {
    if (entries.length === 0) return;
    setGenerating(true);
    try {
      saveReportDefaults(config, defaults);
      const groups = presentTypes.map((t) => {
        const typeEntries = entries.filter((e) => e.mds_type === t.value);
        const typeDefaults = defaults.per_type[t.value] || { fund_cluster: "", bank_name_account_no: "" };
        const first = typeEntries[0];
        return {
          sheetName: t.label,
          subtypeLabel: t.label.toUpperCase(),
          entries: typeEntries as unknown as (ReportRow & { date: string; serial_no: string; dv_payroll_no: string; ors_burs_no: string; responsibility_center_code: string; payee: string; uacs_object_code: string; nature_of_payment: string; amount: string })[],
          meta: {
            entity_name: defaults.entity_name || first.entity_name,
            fund_cluster: typeDefaults.fund_cluster || first.fund_cluster,
            bank_name_account_no: typeDefaults.bank_name_account_no || first.bank_name_account_no,
            report_no: reportNo.trim() || first.report_no,
            sheet_no: sheetNo.trim() || first.sheet_no,
            prepared_by_name: defaults.prepared_by_name || first.prepared_by_name,
            prepared_by_position: defaults.prepared_by_position || first.prepared_by_position,
            certified_by_name: defaults.certified_by_name || first.certified_by_name,
            certified_by_position: defaults.certified_by_position || first.certified_by_position,
          },
          certificationLine2: `the period stated above for which ${config.rangeCertNoun} ${rangeFrom.trim() || String(first[config.rangeFromKey] ?? "")} to ${rangeTo.trim() || String(first[config.rangeToKey] ?? "")} inclusive, were actually issued by me in the amounts shown thereon.`,
        };
      });
      await generateReportWorkbook(config.kind, period, config.topRightLabel, config.workbookTitle, config.totalLabel, groups);
      onOpenChange(false);
    } catch (err) {
      Swal.fire({ icon: "error", title: "Couldn't generate report", text: String(err), ...swalTheme });
    } finally {
      setGenerating(false);
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
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Generate {config.label} Report</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {period && (
            <p className="text-xs text-muted-foreground">
              Period: <span className="font-medium text-foreground">{period}</span> · {entries.length} entr{entries.length === 1 ? "y" : "ies"}
            </p>
          )}
          {entries.length === 0 && (
            <p className="text-sm text-destructive">No entries in the current filter to generate a report from.</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            {field("Report No.", <Input value={reportNo} onChange={(e) => setReportNo(e.target.value)} />)}
            {field("Sheet No.", <Input value={sheetNo} onChange={(e) => setSheetNo(e.target.value)} />)}
            {field(`${config.rangeLabel} From`, <Input value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />)}
            {field(`${config.rangeLabel} To`, <Input value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />)}
          </div>

          {field("Entity Name", <Input value={defaults.entity_name} onChange={(e) => updateDefault("entity_name", e.target.value)} />)}

          {presentTypes.map((t) => (
            <div key={t.value} className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
              <p className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t.label}</p>
              {field("Fund Cluster", (
                <Input value={defaults.per_type[t.value]?.fund_cluster || ""} onChange={(e) => updatePerType(t.value, "fund_cluster", e.target.value)} />
              ))}
              {field("Bank Name / Account No.", (
                <Input value={defaults.per_type[t.value]?.bank_name_account_no || ""} onChange={(e) => updatePerType(t.value, "bank_name_account_no", e.target.value)} />
              ))}
            </div>
          ))}

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
            {field("Prepared By", <Input value={defaults.prepared_by_name} onChange={(e) => updateDefault("prepared_by_name", e.target.value)} />)}
            {field("Position", <Input value={defaults.prepared_by_position} onChange={(e) => updateDefault("prepared_by_position", e.target.value)} />)}
            {field("Certified By", <Input value={defaults.certified_by_name} onChange={(e) => updateDefault("certified_by_name", e.target.value)} />)}
            {field("Position / Title", <Input value={defaults.certified_by_position} onChange={(e) => updateDefault("certified_by_position", e.target.value)} />)}
          </div>

          <p className="text-xs text-muted-foreground">These values are remembered as defaults for next time.</p>
        </div>
        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={generating}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={generating || entries.length === 0}>{generating ? "Generating…" : "Generate .xlsx"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// One tab's worth of table — used for both RADAI and RCI via config.
// ─────────────────────────────────────────────────────────────────────────
function ReportTab({ config }: { config: ReportConfig }) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<ReportRow[]>([]);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editing, setEditing] = useState<ReportRow | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = async () => {
    setLoading(true);
    try {
      setEntries(await config.api.list({ archived: showArchived }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.kind, showArchived]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => {
      if (month && e.date?.slice(0, 7) !== month) return false;
      if (typeFilter && e.mds_type !== typeFilter) return false;
      if (!q) return true;
      return (
        e.serial_no.toLowerCase().includes(q) ||
        e.dv_payroll_no.toLowerCase().includes(q) ||
        e.payee.toLowerCase().includes(q) ||
        e.nature_of_payment.toLowerCase().includes(q) ||
        e.uacs_object_code.toLowerCase().includes(q)
      );
    });
  }, [entries, search, month, typeFilter]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, month, typeFilter, showArchived, filtered.length]);

  const pageIds = useMemo(() => paginated.map((e) => e.id), [paginated]);
  const { selected, toggle, toggleAll, clear: clearSelection, isAllSelected, isSomeSelected } = useSelection<number>();

  const total = filtered.reduce((s, e) => s + sumAmountLines(e.amount), 0);
  const byType = config.mdsTypeOptions.map((o) => {
    const rows = filtered.filter((e) => e.mds_type === o.value);
    return { ...o, count: rows.length, amount: rows.reduce((s, e) => s + sumAmountLines(e.amount), 0) };
  });
  const periods = new Set(filtered.map((e) => e.date?.slice(0, 7)).filter(Boolean)).size;

  const hasFilter = !!(search || month || typeFilter);
  const clearFilters = () => { setSearch(""); setMonth(""); setTypeFilter(""); };

  const handleAdd = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (row: ReportRow) => { setEditing(row); setFormOpen(true); };

  const handleDelete = async (row: ReportRow) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete this ${config.label} entry?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await config.api.remove(row.id);
    load();
  };

  const handleArchiveToggle = async (row: ReportRow) => {
    if (row.is_archived) await config.api.unarchive(row.id);
    else await config.api.archive(row.id);
    load();
  };

  const handleBulkDelete = async () => {
    const count = selected.size;
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${count} ${config.label} entr${count === 1 ? "y" : "ies"}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await config.api.bulkDelete([...selected]);
    clearSelection();
    load();
  };

  const handleBulkArchive = async (archived: boolean) => {
    await config.api.bulkArchive([...selected], archived);
    clearSelection();
    load();
  };

  const handleExportCsv = () => {
    downloadCsv(
      `${config.kind}_report_${new Date().toISOString().slice(0, 10)}`,
      [
        { key: "mds_type", label: "Type", format: (r: ReportRow) => config.mdsTypeOptions.find((o) => o.value === r.mds_type)?.label || r.mds_type },
        { key: "date", label: "Date", format: (r: ReportRow) => formatDate(r.date) },
        { key: "serial_no", label: "Serial No." },
        { key: "dv_payroll_no", label: "DV/Payroll No." },
        { key: "ors_burs_no", label: "ORS/BURS No.", format: (r: ReportRow) => r.ors_burs_no.replace(/\n/g, "; ") },
        { key: "responsibility_center_code", label: "RC Code" },
        { key: "payee", label: "Payee" },
        { key: "uacs_object_code", label: "UACS Object Code", format: (r: ReportRow) => r.uacs_object_code.replace(/\n/g, "; ") },
        { key: "nature_of_payment", label: "Nature of Payment" },
        { key: "amount", label: "Amount", format: (r: ReportRow) => formatMoney(r.amount) },
        { key: "period_covered", label: "Period Covered" },
        { key: "entity_name", label: "Entity Name" },
        { key: "fund_cluster", label: "Fund Cluster" },
        { key: "bank_name_account_no", label: "Bank / Account No." },
        { key: "report_no", label: "Report No." },
        { key: "sheet_no", label: "Sheet No." },
        { key: config.rangeFromKey, label: `${config.rangeLabel} From` },
        { key: config.rangeToKey, label: `${config.rangeLabel} To` },
        { key: "prepared_by_name", label: "Prepared By" },
        { key: "certified_by_name", label: "Certified By" },
      ],
      filtered
    );
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {byType.map((t) => (
          <div key={t.value} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold mb-3 text-primary">{t.label}</p>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Entries</p>
                <p className="text-2xl font-bold text-foreground">{t.count}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground font-medium">Total Amount</p>
                <p className="text-lg font-bold text-foreground">₱{formatMoney(t.amount)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <KpiStrip cards={[
        { title: "Total Entries", value: String(filtered.length), icon: Search },
        { title: "Total Amount", value: `₱${formatMoney(total)}`, icon: Download },
        { title: "Periods", value: String(periods), icon: Archive },
      ]} />

      <div className="flex items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
        <div className="relative flex-1 max-w-xs sm:max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search serial, DV#, payee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">All Types</option>
          {config.mdsTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {hasFilter && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
        <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <div className="flex gap-2 ml-auto sm:ml-0">
          <Button variant="outline" className="text-foreground" onClick={() => setGenerateOpen(true)} disabled={filtered.length === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Generate Report
          </Button>
          <Button variant="outline" className="text-foreground" onClick={handleExportCsv} disabled={filtered.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button variant="outline" className="text-foreground" onClick={() => setPasteOpen(true)}>
            <ClipboardPaste className="w-4 h-4 mr-2" /> Paste Import
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" /> Add Entry
          </Button>
        </div>
      </div>

      <BulkActionBar
        count={selected.size}
        itemLabel={`${config.label} entry`}
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
          <div className="grid grid-cols-[24px_90px_90px_100px_110px_1fr_120px_110px_auto] gap-3 px-5 py-3 border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[1100px]">
            <SelectAllCheckbox checked={isAllSelected(pageIds)} indeterminate={isSomeSelected(pageIds)} onChange={() => toggleAll(pageIds)} />
            <span>Type</span>
            <span>Date</span>
            <span>Serial No.</span>
            <span>DV/Payroll No.</span>
            <span>Payee</span>
            <span>Amount</span>
            <span>Period</span>
            <span>Actions</span>
          </div>

          {paginated.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground min-w-[1100px]">
              {showArchived ? "No archived entries." : hasFilter ? "No entries match the current filters." : `No ${config.label} entries yet. Click "Add Entry" to begin.`}
            </div>
          ) : (
            paginated.map((row) => (
              <div key={row.id} className="grid grid-cols-[24px_90px_90px_100px_110px_1fr_120px_110px_auto] gap-3 px-5 py-3 border-b border-border last:border-0 items-center text-sm min-w-[1100px] hover:bg-accent/40 transition-colors">
                <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                <Badge variant={row.mds_type === "regular" ? "blue" : row.mds_type === "special" ? "purple" : "orange"}>
                  {config.mdsTypeOptions.find((o) => o.value === row.mds_type)?.label.split("-")[1] || row.mds_type}
                </Badge>
                <span className="text-foreground whitespace-nowrap">{formatDate(row.date)}</span>
                <span className="text-foreground truncate">{row.serial_no}</span>
                <span className="text-foreground truncate">{row.dv_payroll_no}</span>
                <span className="text-foreground truncate" title={row.payee}>{row.payee}</span>
                <span className="text-foreground whitespace-nowrap">₱{formatMoney(row.amount)}</span>
                <span className="text-xs text-muted-foreground truncate">{row.period_covered}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleEdit(row)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleArchiveToggle(row)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title={row.is_archived ? "Unarchive" : "Archive"}>
                    {row.is_archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => handleDelete(row)} className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
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
        totalItems={filtered.length}
        onPageSizeChange={setPageSize}
        availablePageSizes={[10, 25, 50, 100]}
      />

      {!loading && (
        <p className="text-xs text-muted-foreground mt-3">Showing {paginated.length} of {filtered.length} {config.label} entries (page {currentPage} of {totalPages || 1})</p>
      )}

      <EntryFormDialog open={formOpen} onOpenChange={setFormOpen} config={config} editing={editing} onSaved={load} />
      <PasteImportDialog open={pasteOpen} onOpenChange={setPasteOpen} config={config} onImported={load} />
      <GenerateReportDialog open={generateOpen} onOpenChange={setGenerateOpen} config={config} entries={filtered} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────
const ReportsPage = () => {
  const [tab, setTab] = useState<"radai" | "rci">("radai");

  return (
    <AdminLayout title="Reports" subtitle="RADAI and RCI reports for the cashier's office">
      <div className="flex gap-1 border-b border-border mb-5">
        <button
          onClick={() => setTab("radai")}
          className={`flex items-center px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${tab === "radai" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}
        >
          RADAI
          <span className="ml-1.5 text-xs text-muted-foreground font-normal">Report of Advice to Debit Account Issued</span>
        </button>
        <button
          onClick={() => setTab("rci")}
          className={`flex items-center px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${tab === "rci" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}
        >
          RCI
          <span className="ml-1.5 text-xs text-muted-foreground font-normal">Report of Checks Issued</span>
        </button>
      </div>

      {tab === "radai" ? <ReportTab key="radai" config={RADAI_CONFIG} /> : <ReportTab key="rci" config={RCI_CONFIG} />}
    </AdminLayout>
  );
};

export default ReportsPage;
