import { labelPapOptions } from "../../lib/papLabel";
import { isCancelledRequest, OPERATION_CANCELLED_MESSAGE } from "../../lib/operationProgress";
import {
  ChevronDown, ChevronRight, Search, Plus,
  Upload, Trash2, Pencil, Archive, ArchiveRestore,
  FileText, Wallet, Scale, AlertTriangle, Settings, Link2,
} from "lucide-react";
import KpiStrip from "../../components/ui/kpi-strip";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import { TableSkeleton } from "./Skeleton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import { sheetSyncApi, SheetSyncSource } from "../../lib/sheetSyncApi";
import { SheetTotalsCard } from "../../components/ui/sheet-totals-card";
import { TopListCard } from "../../components/ui/top-list-card";
import { SheetSyncManagerDialog } from "../../components/admin/SheetSyncManagerDialog";
import {
  receivedSaroApi, ReceivedSARO, ReceivedSAROLineItem, BulkImportGroupResult,
} from "../../lib/receivedSaroApi";
import {
  papApi, classTypeApi, fundSourceApi, objectCodeApi,
  PAP, ClassType, FundSource, ObjectCode,
} from "../../lib/referenceDataApi";
import { QuickFillSelect } from "../../components/ui/quick-fill-select";
import { ComboInput } from "../../components/ui/combo-input";
import { Pagination } from "../../components/ui/pagination";
import { ReceivedSaroDetailDialog } from "../../components/admin/detail/ReceivedSaroDetailDialog";
import { BulkActionBar } from "../../components/ui/bulk-action-bar";
import { SelectAllCheckbox } from "../../components/ui/select-all-checkbox";
import { useSelection } from "../../lib/useSelection";
import DateRangeFilterBar from "../../components/filters/DateRangeFilterBar";
import { useDateRangeFilter } from "../../lib/useDateRangeFilter";
import { Badge } from "../../components/ui/badge";
import { CategoryChip } from "../../components/ui/category-chip";
import { useTableSort, matchesColumnFilters } from "../../lib/useTableSort";
import { SortFilterHeader } from "../../components/ui/sortable-header";
import { useEffect, useMemo, useState } from "react";

// ── form value shapes (everything as strings — that's what inputs give us) ──
interface LineItemForm {
  object_code: string;
  object_description: string;
  amount: string;
  nca_amount: string;
  nca_date: string;
  nta_no: string;
  balance: string;
}

interface HeaderForm {
  saro_no: string;
  region: string;
  date_received: string;
  date_of_saro: string;
  classification: string;
  validity_notes: string;
  amount: string;
  pap_code: string;
  pap_name: string;
  class_type_label: string;
  fund_type: string;
  particulars: string;
}

const emptyLineItem = (): LineItemForm => ({
  object_code: "", object_description: "", amount: "",
  nca_amount: "", nca_date: "", nta_no: "", balance: "",
});

const emptyHeader = (): HeaderForm => ({
  saro_no: "", region: "", date_received: "", date_of_saro: "",
  classification: "", validity_notes: "", amount: "", pap_code: "",
  pap_name: "", class_type_label: "", fund_type: "", particulars: "",
});

const entryToHeaderForm = (entry: ReceivedSARO): HeaderForm => ({
  saro_no: entry.saro_no,
  region: entry.region,
  date_received: entry.date_received || "",
  date_of_saro: entry.date_of_saro || "",
  classification: entry.classification,
  validity_notes: entry.validity_notes,
  amount: entry.amount,
  pap_code: entry.pap_code,
  pap_name: entry.pap_name,
  class_type_label: entry.class_type_label,
  fund_type: entry.fund_type,
  particulars: entry.particulars,
});

const entryToLineItemForms = (entry: ReceivedSARO): LineItemForm[] =>
  entry.line_items.length
    ? entry.line_items.map((li) => ({
      object_code: li.object_code,
      object_description: li.object_description,
      amount: li.amount,
      nca_amount: li.nca_amount ?? "",
      nca_date: li.nca_date ?? "",
      nta_no: li.nta_no,
      balance: li.balance ?? "",
    }))
    : [emptyLineItem()];

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

const toApiPayload = (header: HeaderForm, lines: LineItemForm[]) => ({
  saro_no: header.saro_no.trim(),
  region: header.region.trim(),
  date_received: header.date_received,
  date_of_saro: header.date_of_saro || null,
  classification: header.classification.trim(),
  validity_notes: header.validity_notes.trim(),
  // A SARO's amount is the sum of its object-code lines (same as the sheet sync).
  amount: (() => {
    const sum = lines.reduce((t, li) => t + (Number(li.amount) || 0), 0);
    return sum > 0 ? sum.toFixed(2) : header.amount || "0";
  })(),
  pap_code: header.pap_code.trim(),
  pap_name: header.pap_name.trim(),
  class_type_label: header.class_type_label.trim(),
  fund_type: header.fund_type.trim(),
  particulars: header.particulars.trim(),
  line_items: lines
    .filter((li) => li.object_code.trim() || li.object_description.trim() || li.amount.trim())
    .map((li) => ({
      object_code: li.object_code.trim(),
      object_description: li.object_description.trim(),
      amount: li.amount || "0",
      nca_amount: li.nca_amount || null,
      nca_date: li.nca_date || null,
      nta_no: li.nta_no.trim(),
      balance: li.balance || null,
    })),
});

// ── dropdown vocabularies, taken from what the real sheets actually contain ──
// Class and Class Type are 1:1 in the data (MOOE → "2 MOOE", PS → "1 PS",
// CO → "6 CO"), so picking one fills the other.
const CLASS_OPTIONS = ["MOOE", "PS", "CO"];
const CLASS_TYPE_BY_CLASS: Record<string, string> = { MOOE: "2 MOOE", PS: "1 PS", CO: "6 CO" };
const CLASS_TYPE_OPTIONS = Object.values(CLASS_TYPE_BY_CLASS);
const SARO_NO_PATTERN = /^\d{4}-\d{2}-\d{4}[A-Za-z]?$/;

const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Notes / Validity is always "Valid for obligation until December 31, <year>"
// in the sheets — pick the year instead of retyping the sentence.
const validityOptions = (): string[] => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1, y + 2, y + 3].map((yr) => `Valid for obligation until December 31, ${yr}`);
};

// Options ordered by how often each value already appears in the table,
// then any extra reference values that aren't used yet.
const rankedOptions = (used: string[], reference: string[] = []): string[] => {
  const counts = new Map<string, number>();
  used.map((v) => v.trim()).filter(Boolean).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const seen = new Set<string>();
  const out: string[] = [];
  Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).forEach(([v]) => { seen.add(v.toLowerCase()); out.push(v); });
  reference.map((v) => v.trim()).filter(Boolean).forEach((v) => {
    if (!seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  });
  return out;
};

// Object codes from the reference list plus any already used on a saved SARO
// (so a code that's missing from reference data is still selectable).
const mergeObjectCodes = (reference: ObjectCode[], entries: ReceivedSARO[]): ObjectCode[] => {
  const byCode = new Map<string, ObjectCode>();
  reference.forEach((oc) => byCode.set(oc.code, oc));
  entries.forEach((e) => e.line_items.forEach((li) => {
    if (li.object_code && !byCode.has(li.object_code)) {
      byCode.set(li.object_code, { id: -1, code: li.object_code, description: li.object_description });
    }
  }));
  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
};

// Native <select> that keeps showing a value even if it isn't in `options`
// (e.g. an older record's free-text value), so editing never blanks it out.
function SelectInput({
  value, onChange, options, placeholder, className = "", disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  className?: string;
  disabled?: boolean;
}) {
  const known = !value || options.some((o) => o.value === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <option value="">{placeholder}</option>
      {!known && <option value={value}>{value}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const swalTheme = {
  background: "hsl(var(--background))",
  color: "hsl(var(--foreground))",
};

// ─────────────────────────────────────────────────────────────────────────
// Shared editable object-code line-items table (used by the entry form and
// by each expanded group in the bulk-import comparison)
// ─────────────────────────────────────────────────────────────────────────
function LineItemsEditor({
  lines, objectCodeList, onUpdateLine, onAddLine, onAddFromObjectCode, onRemoveLine,
}: {
  lines: LineItemForm[];
  objectCodeList: ObjectCode[];
  onUpdateLine: (index: number, field: keyof LineItemForm, value: string) => void;
  onAddLine: () => void;
  onAddFromObjectCode: (oc: ObjectCode) => void;
  onRemoveLine: (index: number) => void;
}) {
  const ocByCode = new Map(objectCodeList.map((oc) => [oc.code, oc]));
  const objectCodeOptions = objectCodeList.map((oc) => ({ value: oc.code, label: `${oc.code} — ${oc.description}` }));

  // Picking a code fills its description; entering NCA keeps Balance = Amount − NCA.
  const changeLine = (i: number, field: keyof LineItemForm, value: string) => {
    onUpdateLine(i, field, value);
    if (field === "object_code") {
      const oc = ocByCode.get(value);
      if (oc) onUpdateLine(i, "object_description", oc.description);
    }
    if (field === "amount" || field === "nca_amount") {
      const amount = field === "amount" ? value : lines[i].amount;
      const nca = field === "nca_amount" ? value : lines[i].nca_amount;
      if (nca !== "" && amount !== "") onUpdateLine(i, "balance", (Number(amount) - Number(nca)).toFixed(2));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-3 sm:flex-col sm:items-stretch">
        <p className="text-sm font-semibold text-foreground">Object Code Breakdown</p>
        <div className="flex items-center gap-2 sm:flex-wrap">
          <div className="w-56 sm:w-full">
            <QuickFillSelect
              placeholder="+ Add line from Object Code list…"
              items={objectCodeList}
              getLabel={(oc) => `${oc.code} — ${oc.description}`}
              onPick={onAddFromObjectCode}
            />
          </div>
          <Button type="button" size="sm" variant="outline" className="text-foreground" onClick={onAddLine}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Blank Line
          </Button>
        </div>
      </div>
      {/* Phones: one stacked card per line instead of a wide table */}
      <div className="hidden sm:flex flex-col gap-3">
        {lines.map((li, i) => (
          <div key={i} className="rounded-lg border border-border p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Line {i + 1}</span>
              <button type="button" onClick={() => onRemoveLine(i)} className="p-1.5 -mr-1.5 text-muted-foreground hover:text-destructive transition" aria-label={`Remove line ${i + 1}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <SelectInput
              value={li.object_code}
              onChange={(v) => changeLine(i, "object_code", v)}
              options={objectCodeOptions}
              placeholder="Select object code…"
            />
            <Input
              placeholder="Description"
              value={li.object_description}
              readOnly={ocByCode.has(li.object_code)}
              onChange={(e) => onUpdateLine(i, "object_description", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              {([
                ["Amount", "amount", "number"],
                ["NCA Amount", "nca_amount", "number"],
                ["NCA Date", "nca_date", "date"],
                ["NTA No.", "nta_no", "text"],
                ["Balance", "balance", "number"],
              ] as const).map(([label, key, type]) => (
                <label key={key} className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                  {label}
                  <Input
                    className="h-9 text-sm text-foreground"
                    type={type}
                    step={type === "number" ? "0.01" : undefined}
                    min={type === "number" && key !== "balance" ? "0" : undefined}
                    inputMode={type === "number" ? "decimal" : undefined}
                    value={li[key]}
                    onChange={(e) => (key === "amount" || key === "nca_amount" ? changeLine(i, key, e.target.value) : onUpdateLine(i, key, e.target.value))}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto border border-border rounded-lg sm:hidden">
        <div className="min-w-[1000px]">
          <div className="grid grid-cols-[1.4fr_1.2fr_110px_110px_120px_110px_110px_36px] gap-2 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Object Code</span>
            <span>Description</span>
            <span>Amount</span>
            <span>NCA Amount</span>
            <span>NCA Date</span>
            <span>NTA No.</span>
            <span>Balance</span>
            <span />
          </div>
          {lines.map((li, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_1.2fr_110px_110px_120px_110px_110px_36px] gap-2 px-3 py-2 border-b border-border last:border-0 items-center">
              <SelectInput
                className="h-8 px-2 text-xs"
                value={li.object_code}
                onChange={(v) => changeLine(i, "object_code", v)}
                options={objectCodeOptions}
                placeholder="Select object code…"
              />
              <Input
                className="h-8 text-xs"
                value={li.object_description}
                readOnly={ocByCode.has(li.object_code)}
                onChange={(e) => onUpdateLine(i, "object_description", e.target.value)}
              />
              <Input className="h-8 text-xs" type="number" step="0.01" min="0" value={li.amount} onChange={(e) => changeLine(i, "amount", e.target.value)} />
              <Input className="h-8 text-xs" type="number" step="0.01" min="0" value={li.nca_amount} onChange={(e) => changeLine(i, "nca_amount", e.target.value)} />
              <Input className="h-8 text-xs" type="date" value={li.nca_date} onChange={(e) => onUpdateLine(i, "nca_date", e.target.value)} />
              <Input className="h-8 text-xs" value={li.nta_no} onChange={(e) => onUpdateLine(i, "nta_no", e.target.value)} />
              <Input className="h-8 text-xs" type="number" step="0.01" value={li.balance} onChange={(e) => onUpdateLine(i, "balance", e.target.value)} title="Auto = Amount − NCA Amount" />
              <button type="button" onClick={() => onRemoveLine(i)} className="text-muted-foreground hover:text-destructive transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Add / Edit dialog — header fields + dynamic object-code line items
// ─────────────────────────────────────────────────────────────────────────
function EntryFormDialog({
  open, onOpenChange, editing, onSaved, papList, fundSourceList, objectCodeList, entries,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ReceivedSARO | null;
  onSaved: () => void;
  papList: PAP[];
  fundSourceList: FundSource[];
  objectCodeList: ObjectCode[];
  entries: ReceivedSARO[];
}) {
  const [header, setHeader] = useState<HeaderForm>(emptyHeader());
  const [lines, setLines] = useState<LineItemForm[]>([emptyLineItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setHeader(editing ? entryToHeaderForm(editing) : { ...emptyHeader(), date_received: todayIso() });
      setLines(editing ? entryToLineItemForms(editing) : [emptyLineItem()]);
      setError(null);
    }
  }, [open, editing]);

  const updateHeader = (field: keyof HeaderForm, value: string) =>
    setHeader((prev) => ({ ...prev, [field]: value }));

  const fundTypeOptions = useMemo(
    () => rankedOptions(entries.map((e) => e.fund_type), fundSourceList.map((f) => f.name)),
    [entries, fundSourceList]
  );
  // PAP: reference list plus any PAP already used on a saved SARO.
  const papOptions = useMemo(() => {
    const byCode = new Map<string, string>();
    papList.forEach((p) => byCode.set(p.code, p.name));
    entries.forEach((e) => { if (e.pap_code && !byCode.has(e.pap_code)) byCode.set(e.pap_code, e.pap_name); });
    return Array.from(byCode.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, name]) => ({ value: code, label: `${code} — ${name}` }));
  }, [papList, entries]);
  const papNameByCode = useMemo(() => new Map(papOptions.map((o) => [o.value, o.label.split(" — ").slice(1).join(" — ")])), [papOptions]);
  const validityChoices = useMemo(() => validityOptions(), []);
  // Purposes already used on saved SAROs, most recently received first.
  const purposeOptions = useMemo(() => {
    const seen = new Set<string>();
    return [...entries]
      .sort((a, b) => (b.date_received || "").localeCompare(a.date_received || "") || b.id - a.id)
      .map((e) => (e.particulars || "").trim())
      .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  }, [entries]);
  const linesTotal = lines.reduce((t, li) => t + (Number(li.amount) || 0), 0);

  const updateLine = (index: number, field: keyof LineItemForm, value: string) =>
    setLines((prev) => prev.map((li, i) => (i === index ? { ...li, [field]: value } : li)));

  const addLine = () => setLines((prev) => [...prev, emptyLineItem()]);
  const addLineFromObjectCode = (oc: ObjectCode) =>
    setLines((prev) => [...prev, { ...emptyLineItem(), object_code: oc.code, object_description: oc.description }]);
  const removeLine = (index: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const handleSubmit = async () => {
    if (!header.saro_no.trim() || !header.date_received) {
      setError("Allotment No. and Date Received are required.");
      return;
    }
    if (!SARO_NO_PATTERN.test(header.saro_no.trim())) {
      setError("Allotment No. must look like 2026-01-0120 (year-month-number, with an optional letter, e.g. 2026-01-0031A).");
      return;
    }
    if (header.date_of_saro && header.date_received && header.date_of_saro > header.date_received) {
      setError("Date of SARO can't be later than the date it was received in email.");
      return;
    }
    if (lines.some((li) => li.amount.trim() && !li.object_code.trim())) {
      setError("Every line with an amount needs an Object Code.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = toApiPayload(header, lines);
      if (editing) {
        await receivedSaroApi.update(editing.id, payload);
      } else {
        await receivedSaroApi.create(payload);
      }
      Swal.fire({
        icon: "success",
        title: editing ? "Entry updated" : "Entry added",
        timer: 1300,
        showConfirmButton: false,
        ...swalTheme,
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const msg = data
        ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ")
        : "Failed to save entry.";
      setError(msg);
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
      <DialogContent className="max-w-5xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>{editing ? `Edit ${editing.saro_no}` : "Add Received SARO"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-6">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          {/* Header fields */}
          <div className="grid grid-cols-3 gap-4 slg:grid-cols-2 sm:grid-cols-1">
            {field("Allotment No. *", (
              <Input value={header.saro_no} onChange={(e) => updateHeader("saro_no", e.target.value)} placeholder="2026-01-0120" />
            ))}
            {field("Date Recd in Email *", (
              <Input type="date" value={header.date_received} onChange={(e) => updateHeader("date_received", e.target.value)} />
            ))}
            {field("Date of SARO", (
              <Input type="date" value={header.date_of_saro} onChange={(e) => updateHeader("date_of_saro", e.target.value)} />
            ))}
            {field("Class", (
              <SelectInput
                value={header.classification}
                onChange={(v) => {
                  updateHeader("classification", v);
                  if (CLASS_TYPE_BY_CLASS[v]) updateHeader("class_type_label", CLASS_TYPE_BY_CLASS[v]);
                }}
                options={CLASS_OPTIONS.map((c) => ({ value: c, label: c }))}
                placeholder="Select class…"
              />
            ))}
            {field("Class Type", (
              <SelectInput
                value={header.class_type_label}
                onChange={(v) => updateHeader("class_type_label", v)}
                options={CLASS_TYPE_OPTIONS.map((c) => ({ value: c, label: c }))}
                placeholder="Select class type…"
              />
            ))}
            {field("Fund Type", (
              <SelectInput
                value={header.fund_type}
                onChange={(v) => updateHeader("fund_type", v)}
                options={fundTypeOptions.map((f) => ({ value: f, label: f }))}
                placeholder="Select fund type…"
              />
            ))}
            <div className="col-span-2 slg:col-span-1">
              {field("PAP", (
                <SelectInput
                  value={header.pap_code}
                  onChange={(code) => {
                    updateHeader("pap_code", code);
                    updateHeader("pap_name", code ? papNameByCode.get(code) || "" : "");
                  }}
                  options={papOptions}
                  placeholder="Select PAP…"
                />
              ))}
            </div>
            {field("Total Amount (sum of lines)", (
              <>
                <Input value={formatMoney(linesTotal)} readOnly tabIndex={-1} className="font-medium bg-muted/40 cursor-not-allowed select-none" />
                <p className="text-[11px] text-muted-foreground">Automatic — enter amounts in the Object Code lines below.</p>
              </>
            ))}
            <div className="col-span-3 slg:col-span-2 sm:col-span-1">
              {field("Purpose", (
                <ComboInput
                  value={header.particulars}
                  onChange={(v) => updateHeader("particulars", v)}
                  options={purposeOptions}
                  placeholder="Search a previous purpose, or type a new one…"
                />
              ))}
            </div>
            <div className="col-span-3 slg:col-span-2 sm:col-span-1">
              {field("Notes / Validity", (
                <SelectInput
                  value={header.validity_notes}
                  onChange={(v) => updateHeader("validity_notes", v)}
                  options={validityChoices.map((v) => ({ value: v, label: v }))}
                  placeholder="Select validity…"
                />
              ))}
            </div>
          </div>

          <LineItemsEditor
            lines={lines}
            objectCodeList={objectCodeList}
            onUpdateLine={updateLine}
            onAddLine={addLine}
            onAddFromObjectCode={addLineFromObjectCode}
            onRemoveLine={removeLine}
          />
        </div>

        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── one row per header field shown in the Current vs Incoming comparison ──
const HEADER_COMPARE_FIELDS: { label: string; key: keyof HeaderForm; type?: string; current: (e?: ReceivedSARO) => string }[] = [
  { label: "Date Recd in Email", key: "date_received", type: "date", current: (e) => formatDate(e?.date_received) },
  { label: "Date of SARO", key: "date_of_saro", type: "date", current: (e) => formatDate(e?.date_of_saro) },
  { label: "Class", key: "classification", current: (e) => e?.classification || "—" },
  { label: "Class Type", key: "class_type_label", current: (e) => e?.class_type_label || "—" },
  { label: "Fund Type", key: "fund_type", current: (e) => e?.fund_type || "—" },
  { label: "PAP Code", key: "pap_code", current: (e) => e?.pap_code || "—" },
  { label: "PAP Name", key: "pap_name", current: (e) => e?.pap_name || "—" },
  { label: "Total Amount", key: "amount", type: "number", current: (e) => formatMoney(e?.amount) },
  { label: "Purpose", key: "particulars", current: (e) => e?.particulars || "—" },
  { label: "Notes / Validity", key: "validity_notes", current: (e) => e?.validity_notes || "—" },
  { label: "Region", key: "region", current: (e) => e?.region || "—" },
];

interface ImportGroupState {
  key: string;
  isNew: boolean;
  existingId: number | null;
  error?: string;
  sourceRows: number[];
  included: boolean;
  expanded: boolean;
  header: HeaderForm;
  lines: LineItemForm[];
}

const groupResultToState = (g: BulkImportGroupResult, i: number): ImportGroupState => ({
  key: `${g.saro_no}-${i}`,
  isNew: g.is_new,
  existingId: g.id,
  error: g.error,
  sourceRows: g.source_rows,
  included: !g.error,
  expanded: false,
  header: {
    saro_no: g.saro_no,
    region: g.region,
    date_received: g.date_received || "",
    date_of_saro: g.date_of_saro || "",
    classification: g.classification,
    validity_notes: g.validity_notes,
    amount: g.amount != null ? String(g.amount) : "",
    pap_code: g.pap_code,
    pap_name: g.pap_name,
    class_type_label: g.class_type_label,
    fund_type: g.fund_type,
    particulars: g.particulars,
  },
  lines: (g.line_items.length ? g.line_items : []).map((li) => ({
    object_code: li.object_code,
    object_description: li.object_description,
    amount: li.amount != null ? String(li.amount) : "",
    nca_amount: li.nca_amount != null ? String(li.nca_amount) : "",
    nca_date: li.nca_date || "",
    nta_no: li.nta_no,
    balance: li.balance != null ? String(li.balance) : "",
  })),
});

// ─────────────────────────────────────────────────────────────────────────
// Bulk import dialog — paste CSV, preview (dry run) with an editable
// Current-vs-Incoming comparison per SARO, then confirm
// ─────────────────────────────────────────────────────────────────────────
function ImportDialog({
  open, onOpenChange, onImported, entries, objectCodeList,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  entries: ReceivedSARO[];
  objectCodeList: ObjectCode[];
}) {
  const [csvText, setCsvText] = useState("");
  const [groups, setGroups] = useState<ImportGroupState[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setCsvText("");
      setGroups(null);
      setWarnings([]);
      setError(null);
      setSearch("");
    }
  }, [open]);

  // Filter is display-only — indexes into the original `groups` array are
  // preserved so updateGroup(index, ...) still targets the right row.
  const visibleGroups = useMemo(() => {
    if (!groups) return [];
    const q = search.trim().toLowerCase();
    return groups
      .map((g, index) => ({ g, index }))
      .filter(({ g }) => {
        if (!q) return true;
        return (
          g.header.saro_no.toLowerCase().includes(q) ||
          (g.header.pap_name || "").toLowerCase().includes(q) ||
          (g.header.particulars || "").toLowerCase().includes(q)
        );
      });
  }, [groups, search]);

  const updateGroup = (index: number, updater: (g: ImportGroupState) => ImportGroupState) =>
    setGroups((prev) => prev && prev.map((g, i) => (i === index ? updater(g) : g)));

  const handlePreview = async () => {
    if (!csvText.trim()) {
      setError("Paste some CSV content first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await receivedSaroApi.previewImport(csvText);
      setGroups(result.groups.map(groupResultToState));
      setWarnings(result.warnings);
    } catch {
      setError("Could not parse this CSV. Check that it includes the header row.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!groups) return;
    setBusy(true);
    setError(null);
    try {
      const payloads = groups
        .filter((g) => g.included && !g.error)
        .map((g) => ({ ...toApiPayload(g.header, g.lines), source_rows: g.sourceRows }));
      const result = await receivedSaroApi.confirmImport(payloads);
      Swal.fire({
        icon: "success",
        title: "Import complete",
        text: `${result.created} created, ${result.updated} updated, ${result.line_items_written} line items written.`,
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
          <DialogTitle>Bulk Import Received SAROs</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Paste CSV content (including the header row — Region, Date Recd in Email, Date of SARO, Allotment No., ... Balance)
            </label>
            <textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setGroups(null); }}
              rows={8}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              placeholder="REGION,DATE RECD IN EMAIL,DATE OF SARO,ALLOTMENT NO., ..."
            />
          </div>

          <div>
            <Button type="button" variant="outline" className="text-foreground" onClick={handlePreview} disabled={busy}>
              {busy && !groups ? "Parsing…" : "Preview"}
            </Button>
          </div>

          {groups && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-foreground">
                Found <strong>{groups.length}</strong> Received SARO(s) —{" "}
                {groups.filter((g) => g.isNew).length} new,{" "}
                {groups.filter((g) => !g.isNew && !g.error).length} will update existing records,{" "}
                {groups.filter((g) => g.included).length} selected to import. Click a row to review and edit before confirming.
              </p>
              {warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-xs rounded-lg px-3 py-2 flex flex-col gap-1">
                  {warnings.map((w, i) => <span key={i}>{w}</span>)}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search Allotment no. or PAP..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                />
              </div>
              <div className="border border-border rounded-lg overflow-hidden max-h-[55vh] overflow-y-auto">
                {visibleGroups.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">No SARO matches "{search}".</div>
                ) : visibleGroups.map(({ g, index }) => {
                  const existingEntry = g.existingId ? entries.find((e) => e.id === g.existingId) : undefined;
                  return (
                    <div key={g.key} className="border-b border-border last:border-0">
                      <div className="px-3 py-2.5 flex items-center gap-3 text-sm">
                        <Button
                          type="button"
                          size="sm"
                          variant={g.included ? "default" : "outline"}
                          className={g.included ? "" : "text-foreground"}
                          disabled={!!g.error}
                          onClick={() => updateGroup(index, (prev) => ({ ...prev, included: !prev.included }))}
                        >
                          {g.error ? "Skipped" : g.isNew ? (g.included ? "Included" : "Include") : (g.included ? "Updating" : "Update")}
                        </Button>
                        <button
                          type="button"
                          className="flex-1 min-w-0 flex items-center gap-2 text-left"
                          onClick={() => updateGroup(index, (prev) => ({ ...prev, expanded: !prev.expanded }))}
                        >
                          {g.expanded ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{g.header.saro_no} — {g.header.pap_name || "(no PAP name)"}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {g.lines.length} line(s) · {formatMoney(g.header.amount)} · rows {g.sourceRows.join(", ")}
                            </p>
                            {g.error && <p className="text-xs text-destructive">{g.error}</p>}
                          </div>
                        </button>
                        <Badge variant={g.error ? "secondary" : g.isNew ? "success" : "warning"} className="shrink-0">
                          {g.error ? "skipped" : g.isNew ? "new" : "update"}
                        </Badge>
                      </div>

                      {g.expanded && (
                        <div className="px-3 pb-4 flex flex-col gap-4 bg-muted/20">
                          <div>
                            <div className="grid grid-cols-2 gap-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-1 mb-1">
                              <span>Current {g.isNew ? "" : `(#${g.existingId})`}</span>
                              <span>Incoming (edit before import)</span>
                            </div>
                            {HEADER_COMPARE_FIELDS.map((f) => (
                              <div key={f.key} className="grid grid-cols-2 gap-4 items-center py-1 border-b border-border/40 last:border-0">
                                <p className="text-xs text-muted-foreground truncate">
                                  {g.isNew ? "— new entry —" : f.current(existingEntry)}
                                </p>
                                <Input
                                  className="h-8 text-xs"
                                  type={f.type || "text"}
                                  step={f.type === "number" ? "0.01" : undefined}
                                  value={g.header[f.key]}
                                  onChange={(e) => updateGroup(index, (prev) => ({ ...prev, header: { ...prev.header, [f.key]: e.target.value } }))}
                                />
                              </div>
                            ))}
                          </div>

                          <LineItemsEditor
                            lines={g.lines.length ? g.lines : [emptyLineItem()]}
                            objectCodeList={objectCodeList}
                            onUpdateLine={(li: number, field: keyof LineItemForm, value: string) =>
                              updateGroup(index, (prev) => ({
                                ...prev,
                                lines: (prev.lines.length ? prev.lines : [emptyLineItem()]).map((line, j) => (j === li ? { ...line, [field]: value } : line)),
                              }))
                            }
                            onAddLine={() => updateGroup(index, (prev) => ({ ...prev, lines: [...(prev.lines.length ? prev.lines : [emptyLineItem()]), emptyLineItem()] }))}
                            onAddFromObjectCode={(oc: ObjectCode) =>
                              updateGroup(index, (prev) => ({
                                ...prev,
                                lines: [...(prev.lines.length ? prev.lines : []), { ...emptyLineItem(), object_code: oc.code, object_description: oc.description }],
                              }))
                            }
                            onRemoveLine={(li: number) =>
                              updateGroup(index, (prev) => ({
                                ...prev,
                                lines: prev.lines.length > 1 ? prev.lines.filter((_, j) => j !== li) : prev.lines,
                              }))
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || !groups || !groups.some((g) => g.included)}>
            {busy && groups ? "Importing…" : "Confirm & Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────
const ReceivedSaroPage = () => {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<ReceivedSARO[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ReceivedSARO | null>(null);
  const [viewing, setViewing] = useState<ReceivedSARO | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sheetSetupOpen, setSheetSetupOpen] = useState(false);
  const [sheetSources, setSheetSources] = useState<SheetSyncSource[]>([]);
  // "Sync Sheets" opens the Sheet Setup dialog straight on its review step (same flow as Bulk Import).
  const [sheetSyncAuto, setSheetSyncAuto] = useState(false);
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
      const data = await receivedSaroApi.list({ archived: showArchived });
      setEntries(data);
      // Linked sheets, for the "by sheet" total — a failure here must never block the list.
      sheetSyncApi.list("received_saro").then(setSheetSources).catch(() => setSheetSources([]));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  // Reference lists for the quick-fill dropdowns — fetched once, managed
  // under Settings > Budget Reference Data.
  useEffect(() => {
    papApi.list().then(setPapList);
    classTypeApi.list().then(setClassTypeList);
    fundSourceApi.list().then(setFundSourceList);
    objectCodeApi.list().then(setObjectCodeList);
  }, []);

  const allObjectCodes = useMemo(() => mergeObjectCodes(objectCodeList, entries), [objectCodeList, entries]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    entries.forEach((e) => { if (e.date_received) years.add(Number(e.date_received.slice(0, 4))); });
    return Array.from(years).sort((a, b) => b - a);
  }, [entries]);

  const [papFilter, setPapFilter] = useState("");
  const papOptions = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => { if (e.pap_code && !map.has(e.pap_code)) map.set(e.pap_code, e.pap_name || e.pap_code); });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const {
    year, quarter, dateFrom, dateTo,
    setYear, applyQuarter, setDateFrom, setDateTo,
    clear: clearDateFilters, inRange, hasActiveDateFilter,
  } = useDateRangeFilter(availableYears);

  const clearFilters = () => {
    clearDateFilters(); setSearch(""); setPapFilter("");
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => {
      if (!inRange(e.date_received)) return false;
      if (papFilter && e.pap_code !== papFilter) return false;
      if (!q) return true;
      return (
        e.saro_no.toLowerCase().includes(q) ||
        e.pap_name.toLowerCase().includes(q) ||
        e.pap_code.toLowerCase().includes(q) ||
        e.fund_type.toLowerCase().includes(q)
      );
    });
  }, [entries, search, papFilter, inRange]);

  // One line per linked sheet (matched by the year set on the sheet), plus any SAROs with no linked sheet.
  const sheetTotals = useMemo(() => {
    const byYear = new Map<string, number>();
    filtered.forEach((e) => {
      const key = e.year ? String(e.year) : "none";
      byYear.set(key, (byYear.get(key) || 0) + Number(e.amount || 0));
    });
    const labelFor = (key: string): { label: string; note?: string } => {
      if (key === "none") return { label: "No linked sheet / added by hand" };
      const names = sheetSources.filter((s) => String(s.year) === key).map((s) => s.label || "(untitled sheet)");
      return names.length
        ? { label: names.join(" + "), note: `${key} sheet` }
        : { label: `${key} (sheet no longer linked)`, note: `${key}` };
    };
    return Array.from(byYear.entries())
      .sort((a, b) => (a[0] === "none" ? 1 : b[0] === "none" ? -1 : Number(b[0]) - Number(a[0])))
      .map(([key, value]) => ({ ...labelFor(key), value }));
  }, [filtered, sheetSources]);

  // The four most recently added SAROs (by when each record was created), whatever the filters.
  const recentSaros = useMemo(
    () => [...entries]
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "") || b.id - a.id)
      .slice(0, 4)
      .map((e) => {
        const added = e.created_at ? new Date(e.created_at) : null;
        const addedText = added && !Number.isNaN(added.getTime())
          ? `Added ${added.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
          : "";
        return {
          key: e.id,
          label: `${e.saro_no}${e.year ? ` (${e.year})` : ""}`,
          note: [addedText, e.pap_name].filter(Boolean).join(" · ") || undefined,
          value: Number(e.amount || 0),
          onClick: () => setViewing(e),
        };
      }),
    [entries]
  );

  // Per-column sort + filter on top of the search/date filters above.
  const { sortKey, sortDir, toggleSort, applySort } = useTableSort<ReceivedSARO>((row, key) => {
    switch (key) {
      case "saro_no": return row.saro_no;
      case "date_received": return row.date_received;
      case "pap_name": return row.pap_name;
      case "fund_type": return row.fund_type;
      case "amount": return Number(row.amount);
      default: return null;
    }
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const setColumnFilter = (key: string, value: string) => setColumnFilters((prev) => ({ ...prev, [key]: value }));

  const columnFiltered = useMemo(
    () => filtered.filter((row) => matchesColumnFilters(row, columnFilters, (r, key) => {
      switch (key) {
        case "saro_no": return r.saro_no;
        case "date_received": return formatDate(r.date_received);
        case "pap_name": return r.pap_name;
        case "fund_type": return r.fund_type;
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
  }, [search, inRange, columnFilters, sorted.length]);

  const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const pageIds = useMemo(() => paginatedData.map((e) => e.id), [paginatedData]);
  const { selected, toggle, toggleAll, clear: clearSelection, isAllSelected, isSomeSelected } = useSelection<number>();

  const handleAdd = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (entry: ReceivedSARO) => { setEditing(entry); setFormOpen(true); };

  const handleDelete = async (entry: ReceivedSARO) => {
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete ${entry.saro_no}?`,
      text: "This permanently removes the SARO and its object-code line items.",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await receivedSaroApi.remove(entry.id);
    load();
  };

  const handleBulkDelete = async () => {
    const count = selected.size;
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete ${count} received SARO${count === 1 ? "" : "s"}?`,
      text: "This permanently removes each SARO and its object-code line items.",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await Promise.all([...selected].map((id) => receivedSaroApi.remove(id)));
    clearSelection();
    load();
  };

  const handleDeleteAll = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete all ${entries.length} received SARO${entries.length === 1 ? "" : "s"}?`,
      html: "This permanently deletes every Received SARO and its object-code line items, including archived ones — not just what's currently filtered or on this page. This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete all", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    const { deleted } = await receivedSaroApi.clearAll();
    Swal.fire({ icon: "success", title: `Deleted ${deleted} entries`, timer: 1300, showConfirmButton: false, ...swalTheme });
    clearSelection();
    load();
  };

  const handleArchiveToggle = async (entry: ReceivedSARO) => {
    if (entry.is_archived) await receivedSaroApi.unarchive(entry.id);
    else await receivedSaroApi.archive(entry.id);
    load();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await sheetSyncApi.sync("received_saro");
      const failedSources = result.sources.filter((s) => s.error);
      const r = result.result;
      const counts = [
        r.created !== undefined ? `${r.created} created` : null,
        r.updated !== undefined ? `${r.updated} updated` : null,
        r.line_items_written !== undefined ? `${r.line_items_written} line items` : null,
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
    <AdminLayout title="SARO Received" subtitle="Track received Special Allotment Release Orders">
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
        hasActiveFilters={hasActiveDateFilter || !!search || !!papFilter}
      >
        <select
          value={papFilter}
          onChange={(e) => setPapFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 max-w-[220px]"
        >
          <option value="">All PAP / Projects</option>
          {labelPapOptions(papOptions).map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
        </select>
      </DateRangeFilterBar>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
        <div className="relative flex-1 min-w-[190px] max-w-xs sm:max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search allotment no., PAP, fund type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <div className="flex flex-wrap gap-2 ml-auto slg:ml-0">
          <Button variant="outline" className="text-foreground" onClick={() => { setSheetSyncAuto(true); setSheetSetupOpen(true); }} title="Sync from Google Sheets — review the rows before saving">
            <Settings className={`w-4 h-4 mr-2 slg:mr-0 ${syncing ? 'animate-spin' : ''}`} />
            <span className="slg:hidden">{syncing ? 'Syncing…' : 'Sync Sheets'}</span>
          </Button>
          <Button variant="outline" className="text-foreground" onClick={() => { setSheetSyncAuto(false); setSheetSetupOpen(true); }} title="Manage Google Sheet sources">
            <Link2 className="w-4 h-4 mr-2 slg:mr-0" /> <span className="slg:hidden">Sheet Setup</span>
          </Button>
          <Button variant="outline" className="text-foreground" onClick={() => setImportOpen(true)} title="Bulk Import" aria-label="Bulk Import">
            <Upload className="w-4 h-4 mr-2 slg:mr-0 text-foreground" /> <span className="slg:hidden">Bulk Import</span>
          </Button>
          <Button variant="outline" className="text-foreground" onClick={handleDeleteAll} disabled={entries.length === 0} title="Delete All" aria-label="Delete All">
            <AlertTriangle className="w-4 h-4 mr-2 slg:mr-0" /> <span className="slg:hidden">Delete All</span>
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" /> Add Entry
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <KpiStrip
        gridClassName="grid-cols-2 slg:grid-cols-1"
        cards={[]}
        leading={
          <SheetTotalsCard
            title="Total Allotment — by linked sheet"
            subtitle="Each sheet's SAROs added together"
            rows={sheetTotals}
            extras={[
              {
                label: "Total Line Items",
                value: String(filtered.reduce((n, x) => n + x.line_items.length, 0)),
                note: `Sheet column: "Object Code no." (one per row) · ${filtered.length} SARO(s)`,
              },
            ]}
          />
        }
        trailing={
          <TopListCard
            ranked={false}
            title="Recently added SARO"
            subtitle="The 4 most recently added, regardless of filters — click to open"
            items={recentSaros}
          />
        }
      />

      <BulkActionBar count={selected.size} itemLabel="received SARO" onDelete={handleBulkDelete} onClear={clearSelection} />

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[24px_24px_1.4fr_1fr_1.6fr_1fr_1fr_auto] gap-4 px-5 sm:gap-2 sm:px-3 py-3 border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide slg:grid-cols-[24px_24px_1.4fr_1fr_auto]">
            <SelectAllCheckbox checked={isAllSelected(pageIds)} indeterminate={isSomeSelected(pageIds)} onChange={() => toggleAll(pageIds)} />
            <span />
            <SortFilterHeader label="Allotment No." sortKey="saro_no" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.saro_no || ""} onFilterChange={(v) => setColumnFilter("saro_no", v)} filterPlaceholder="Filter…" />
            <div className="slg:hidden">
              <SortFilterHeader label="Date Received" sortKey="date_received" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.date_received || ""} onFilterChange={(v) => setColumnFilter("date_received", v)} filterPlaceholder="Filter…" />
            </div>
            <div className="slg:hidden">
              <SortFilterHeader label="PAP" sortKey="pap_name" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.pap_name || ""} onFilterChange={(v) => setColumnFilter("pap_name", v)} filterPlaceholder="Filter…" />
            </div>
            <div className="slg:hidden">
              <SortFilterHeader label="Fund Type" sortKey="fund_type" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.fund_type || ""} onFilterChange={(v) => setColumnFilter("fund_type", v)} filterPlaceholder="Filter…" />
            </div>
            <SortFilterHeader label="Amount" sortKey="amount" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.amount || ""} onFilterChange={(v) => setColumnFilter("amount", v)} filterPlaceholder="Filter…" />
            <span>Actions</span>
          </div>

          {paginatedData.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No received SAROs found.
            </div>
          ) : (
            paginatedData.map((entry) => (
              <div key={entry.id}>
                <div
                  onClick={() => setViewing(entry)}
                  className="grid grid-cols-[24px_24px_1.4fr_1fr_1.6fr_1fr_1fr_auto] gap-4 px-5 sm:gap-2 sm:px-3 py-3.5 border-b border-border items-center hover:bg-accent/40 transition-colors slg:grid-cols-[24px_24px_1.4fr_1fr_auto] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(entry.id)}
                    onChange={() => toggle(entry.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button onClick={(e) => { e.stopPropagation(); toggleExpanded(entry.id); }} className="text-muted-foreground hover:text-foreground transition">
                    {expanded.has(entry.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-medium text-foreground truncate sm:whitespace-normal sm:break-words">{entry.saro_no}</p>
                      {entry.year && (
                        <Badge variant="outline" title={`${entry.year} sheet`}>{entry.year}</Badge>
                      )}
                      {entry.is_archived && (
                        <Badge variant="destructive">archived</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{entry.classification || "—"} · {entry.class_type_label || "—"}</p>
                  </div>
                  <p className="text-sm text-foreground slg:hidden">{formatDate(entry.date_received)}</p>
                  <p className="text-sm text-foreground truncate slg:hidden">{entry.pap_name || "—"}</p>
                  <div className="min-w-0 slg:hidden"><CategoryChip label={entry.fund_type} /></div>
                  <p className="text-sm font-medium text-foreground">{formatMoney(entry.amount)}</p>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleEdit(entry)} className="p-1.5 sm:p-2.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleArchiveToggle(entry)} className="p-1.5 sm:p-2.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title={entry.is_archived ? "Unarchive" : "Archive"}>
                      {entry.is_archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => handleDelete(entry)} className="p-1.5 sm:p-2.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {expanded.has(entry.id) && (
                  <div className="px-5 py-3 bg-muted/20 border-b border-border">
                    {entry.particulars && (
                      <p className="text-xs text-muted-foreground mb-2"><span className="font-medium text-foreground">Purpose:</span> {entry.particulars}</p>
                    )}
                    <div className="overflow-x-auto">
                      <div className="min-w-[700px] border border-border rounded-lg overflow-hidden">
                        <div className="grid grid-cols-[110px_1.5fr_110px_110px_100px_100px_110px] gap-2 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <span>Object Code</span>
                          <span>Description</span>
                          <span>Amount</span>
                          <span>NCA Amount</span>
                          <span>NCA Date</span>
                          <span>NTA No.</span>
                          <span>Balance</span>
                        </div>
                        {entry.line_items.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-muted-foreground">No line items.</div>
                        ) : (
                          entry.line_items.map((li: ReceivedSAROLineItem) => (
                            <div key={li.id} className="grid grid-cols-[110px_1.5fr_110px_110px_100px_100px_110px] gap-2 px-3 py-2 border-b border-border last:border-0 text-xs">
                              <span className="text-foreground">{li.object_code || "—"}</span>
                              <span className="text-foreground truncate">{li.object_description || "—"}</span>
                              <span className="text-foreground">{formatMoney(li.amount)}</span>
                              <span className="text-foreground">{formatMoney(li.nca_amount)}</span>
                              <span className="text-foreground">{formatDate(li.nca_date)}</span>
                              <span className="text-foreground">{li.nta_no || "—"}</span>
                              <span className="text-foreground">{formatMoney(li.balance)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!loading && (
        <p className="text-xs text-muted-foreground mt-3">
          Showing {paginatedData.length} of {sorted.length} received SAROs (page {currentPage} of {totalPages})
        </p>
      )}

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

      <EntryFormDialog
        open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={load}
        papList={papList} fundSourceList={fundSourceList} objectCodeList={allObjectCodes} entries={entries}
      />
      <ImportDialog
        open={importOpen} onOpenChange={setImportOpen} onImported={load}
        entries={entries} objectCodeList={allObjectCodes}
      />
      <ReceivedSaroDetailDialog entry={viewing} open={!!viewing} onOpenChange={(open) => !open && setViewing(null)} />
      <SheetSyncManagerDialog open={sheetSetupOpen} autoPreview={sheetSyncAuto} onOpenChange={setSheetSetupOpen} table="received_saro" label="Received SARO" onSynced={load} />
    </AdminLayout>
  );
};

export default ReceivedSaroPage;
function extractError(err: unknown): string | undefined {
  if (isCancelledRequest(err)) return OPERATION_CANCELLED_MESSAGE;
  throw new Error("Function not implemented.");
}

