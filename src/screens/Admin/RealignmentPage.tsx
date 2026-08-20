import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, ArchiveRestore, ArrowRightLeft, CheckCircle2, FileSpreadsheet,
  Loader2, Pencil, Plus, Search, Trash2, Upload, UploadCloud,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { receivedSaroApi, ReceivedSARO } from "../../lib/receivedSaroApi";
import {
  realignmentApi, RealignmentEntry, RealignmentEntryPayload,
} from "../../lib/realignmentApi";

type Draft = RealignmentEntryPayload;

interface ImportRow extends Draft {
  key: string;
  status: "pending" | "success" | "error";
  error?: string;
}

const emptyDraft = (): Draft => ({
  month: "",
  fund: "",
  class_type: "",
  pap_name: "",
  saro_no: "",
  realignment_ref: "",
  account_code: "",
  account_title: "",
  transfer_to: "0",
  transfer_from: "0",
});

const formatMoney = (value: string | number) => new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP", minimumFractionDigits: 2,
}).format(Number(value) || 0);

const amount = (value: string | number) => Number(value) || 0;

const monthLabel = (value: string) => {
  if (!/^\d{4}-\d{2}$/.test(value)) return value || "—";
  return new Date(`${value}-01T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "numeric" });
};

const errorMessage = (error: unknown) => {
  const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return "Unable to save the realignment entry.";
  return Object.entries(data).map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(" ") : String(value)}`).join(" | ");
};

function RealignmentFormDialog({
  open, entry, saros, onClose, onSaved,
}: {
  open: boolean;
  entry: RealignmentEntry | null;
  saros: ReceivedSARO[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [sourceSaroId, setSourceSaroId] = useState("");
  const [direction, setDirection] = useState<"to" | "from">("to");
  const [transferAmount, setTransferAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!entry) {
      setDraft(emptyDraft());
      setSourceSaroId("");
      setDirection("to");
      setTransferAmount("");
    } else {
      const toAmount = amount(entry.transfer_to);
      setDraft({
        month: entry.month, fund: entry.fund, class_type: entry.class_type,
        pap_name: entry.pap_name, saro_no: entry.saro_no,
        realignment_ref: entry.realignment_ref, account_code: entry.account_code,
        account_title: entry.account_title, transfer_to: entry.transfer_to,
        transfer_from: entry.transfer_from,
      });
      setSourceSaroId(String(saros.find((saro) => saro.saro_no === entry.saro_no)?.id || ""));
      setDirection(toAmount > 0 ? "to" : "from");
      setTransferAmount(toAmount > 0 ? entry.transfer_to : entry.transfer_from);
    }
    setError(null);
  }, [open, entry, saros]);

  const update = (field: keyof Draft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const selectedSaro = saros.find((saro) => saro.id === Number(sourceSaroId));

  const chooseSaro = (id: string) => {
    setSourceSaroId(id);
    const saro = saros.find((item) => item.id === Number(id));
    if (!saro) return;
    setDraft((current) => ({
      ...current,
      saro_no: saro.saro_no,
      pap_name: saro.pap_name || current.pap_name,
      fund: saro.fund_type || current.fund,
      class_type: saro.class_type_label || current.class_type,
    }));
  };

  const chooseLineItem = (id: string) => {
    const item = selectedSaro?.line_items.find((line) => line.id === Number(id));
    if (!item) return;
    setDraft((current) => ({
      ...current,
      account_code: item.object_code,
      account_title: item.object_description,
    }));
  };

  const submit = async () => {
    const normalizedAmount = amount(transferAmount.replace(/,/g, ""));
    if (!draft.month || !draft.saro_no.trim() || !draft.realignment_ref.trim() || !draft.account_code.trim() || normalizedAmount <= 0) {
      setError("Month, SARO No., MAP reference, account code, and a positive amount are required.");
      return;
    }
    const payload: Draft = {
      ...draft,
      month: draft.month,
      saro_no: draft.saro_no.trim(),
      realignment_ref: draft.realignment_ref.trim(),
      account_code: draft.account_code.trim(),
      transfer_to: direction === "to" ? normalizedAmount.toFixed(2) : "0",
      transfer_from: direction === "from" ? normalizedAmount.toFixed(2) : "0",
    };
    setSaving(true);
    setError(null);
    try {
      if (entry) await realignmentApi.update(entry.id, payload);
      else await realignmentApi.create(payload);
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>{entry ? "Edit Realignment Entry" : "Add Realignment Entry"}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto px-5 py-5 space-y-4">
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
            <Field label="Month *"><Input type="month" value={draft.month} onChange={(event) => update("month", event.target.value)} /></Field>
            <Field label="Realignment Reference (MAP No.) *"><Input value={draft.realignment_ref} onChange={(event) => update("realignment_ref", event.target.value)} placeholder="e.g. 2026-02-0001" /></Field>
          </div>
          <Field label="Source Received SARO">
            <select value={sourceSaroId} onChange={(event) => chooseSaro(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select a SARO to auto-fill fields</option>
              {saros.map((saro) => <option key={saro.id} value={saro.id}>{saro.saro_no}{saro.pap_name ? ` — ${saro.pap_name}` : ""}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
            <Field label="SARO No. *"><Input value={draft.saro_no} onChange={(event) => update("saro_no", event.target.value)} /></Field>
            <Field label="PAP Name"><Input value={draft.pap_name} onChange={(event) => update("pap_name", event.target.value)} /></Field>
            <Field label="Fund"><Input value={draft.fund} onChange={(event) => update("fund", event.target.value)} /></Field>
            <Field label="Class"><Input value={draft.class_type} onChange={(event) => update("class_type", event.target.value)} /></Field>
          </div>
          {selectedSaro && selectedSaro.line_items.length > 0 && (
            <Field label="Account from Source SARO">
              <select defaultValue="" onChange={(event) => chooseLineItem(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select an object code to auto-fill</option>
                {selectedSaro.line_items.map((item) => <option key={item.id} value={item.id}>{item.object_code} — {item.object_description}</option>)}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
            <Field label="Account Code *"><Input value={draft.account_code} onChange={(event) => update("account_code", event.target.value)} /></Field>
            <Field label="Account Title"><Input value={draft.account_title} onChange={(event) => update("account_title", event.target.value)} /></Field>
          </div>
          <Field label="Transfer Direction *">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={direction === "to" ? "default" : "outline"} onClick={() => setDirection("to")}>Transfer To (+)</Button>
              <Button type="button" variant={direction === "from" ? "destructive" : "outline"} onClick={() => setDirection("from")}>Transfer From (-)</Button>
            </div>
          </Field>
          <Field label="Amount *"><Input type="number" min="0" step="0.01" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} /></Field>
        </div>
        <DialogFooter className="border-t border-border justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{entry ? "Save Changes" : "Add Entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}

function parseMonth(value: string) {
  const cleaned = value.trim();
  if (/^\d{4}-\d{2}$/.test(cleaned)) return cleaned;
  const match = cleaned.match(/^([a-z]{3})[a-z]*[\s,-]+(\d{4})$/i);
  const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  return match && months[match[1].toLowerCase()] ? `${match[2]}-${months[match[1].toLowerCase()]}` : cleaned;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell.replace(/\r$/, "")); if (row.some((item) => item.trim())) rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell); if (row.some((item) => item.trim())) rows.push(row); }
  return rows;
}

function toImportRows(grid: string[][]): ImportRow[] {
  return grid.flatMap((columns, index) => {
    const value = (position: number) => String(columns[position] ?? "").trim();
    const firstCell = value(0).toLowerCase();
    if (!firstCell || firstCell === "month" || firstCell.includes("realign") || (!value(4) && !value(5))) return [];
    return [{
      key: `${index}-${Date.now()}`,
      month: parseMonth(value(0)), fund: value(1), class_type: value(2), pap_name: value(3),
      saro_no: value(4), realignment_ref: value(5), account_code: value(6), account_title: value(7),
      transfer_to: value(8).replace(/,/g, "") || "0", transfer_from: value(9).replace(/,/g, "") || "0",
      status: "pending",
    }];
  });
}

function BulkImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFile = async (file: File) => {
    setError(null);
    try {
      let grid: string[][];
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const ExcelJS = (await import("exceljs")).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error("The workbook has no worksheets.");
        grid = [];
        sheet.eachRow({ includeEmpty: false }, (row) => {
          grid.push(Array.from({ length: row.cellCount }, (_, index) => row.getCell(index + 1).text));
        });
      } else if (file.name.toLowerCase().endsWith(".xls")) {
        throw new Error("Legacy .xls files are not supported. Please save the file as .xlsx or .csv first.");
      } else {
        grid = parseCsv(await file.text());
      }
      const imported = toImportRows(grid);
      if (!imported.length) throw new Error("No realignment rows were found. Use the expected ten-column layout.");
      setRows(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be read.");
    }
  };

  const updateRow = (key: string, field: keyof Draft, value: string) => setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value, status: "pending", error: undefined } : row));
  const removeRow = (key: string) => setRows((current) => current.filter((row) => row.key !== key));

  const importRows = async () => {
    setImporting(true);
    for (const row of rows.filter((item) => item.status === "pending")) {
      try {
        const { key, status, error: _error, ...payload } = row;
        await realignmentApi.create(payload);
        setRows((current) => current.map((item) => item.key === key ? { ...item, status: "success" } : item));
      } catch (err) {
        setRows((current) => current.map((item) => item.key === row.key ? { ...item, status: "error", error: errorMessage(err) } : item));
      }
    }
    setImporting(false);
    await onDone();
  };

  const pending = rows.filter((row) => row.status === "pending").length;
  const saved = rows.filter((row) => row.status === "success").length;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[95vw]">
        <DialogHeader className="border-b border-border"><DialogTitle>Bulk Import Realignment</DialogTitle></DialogHeader>
        <div className="overflow-y-auto px-5 py-5 space-y-4">
          <p className="text-xs text-muted-foreground">Columns: Month, Fund, Class, PAP Name, SARO No., MAP Ref, Account Code, Account Title, Transfer To, Transfer From.</p>
          {rows.length === 0 ? (
            <button type="button" onClick={() => fileInput.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-10 text-sm hover:border-primary/60 hover:bg-muted/20">
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <span>Choose a CSV or .xlsx file</span><span className="text-xs text-muted-foreground">The first worksheet is used.</span>
            </button>
          ) : (
            <>
              <div className="flex items-center gap-3 text-sm"><span>{rows.length} rows</span><span className="text-emerald-600">{saved} saved</span><span className="text-muted-foreground">{pending} pending</span><Button size="sm" variant="outline" className="ml-auto" onClick={() => setRows([])} disabled={importing}>Change file</Button></div>
              <div className="overflow-x-auto rounded-lg border border-border"><table className="min-w-[1150px] text-xs"><thead className="bg-primary text-primary-foreground"><tr>{["Month", "Fund", "Class", "PAP Name", "SARO No.", "MAP Ref", "Account Code", "Account Title", "To (+)", "From (-)", ""].map((heading) => <th key={heading} className="px-2 py-2 text-left font-medium">{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.key} className="border-t border-border"><td className="px-1 py-1"><Input className="h-7 text-xs" value={row.month} onChange={(event) => updateRow(row.key, "month", event.target.value)} /></td><td className="px-1 py-1"><Input className="h-7 text-xs" value={row.fund} onChange={(event) => updateRow(row.key, "fund", event.target.value)} /></td><td className="px-1 py-1"><Input className="h-7 text-xs" value={row.class_type} onChange={(event) => updateRow(row.key, "class_type", event.target.value)} /></td><td className="px-1 py-1"><Input className="h-7 text-xs" value={row.pap_name} onChange={(event) => updateRow(row.key, "pap_name", event.target.value)} /></td><td className="px-1 py-1"><Input className="h-7 text-xs" value={row.saro_no} onChange={(event) => updateRow(row.key, "saro_no", event.target.value)} /></td><td className="px-1 py-1"><Input className="h-7 text-xs" value={row.realignment_ref} onChange={(event) => updateRow(row.key, "realignment_ref", event.target.value)} /></td><td className="px-1 py-1"><Input className="h-7 text-xs" value={row.account_code} onChange={(event) => updateRow(row.key, "account_code", event.target.value)} /></td><td className="px-1 py-1"><Input className="h-7 text-xs" value={row.account_title} onChange={(event) => updateRow(row.key, "account_title", event.target.value)} /></td><td className="px-1 py-1"><Input className="h-7 text-xs" value={row.transfer_to} onChange={(event) => updateRow(row.key, "transfer_to", event.target.value)} /></td><td className="px-1 py-1"><Input className="h-7 text-xs" value={row.transfer_from} onChange={(event) => updateRow(row.key, "transfer_from", event.target.value)} /></td><td className="px-2 py-1"><div className="flex items-center gap-1">{row.status === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{row.status === "error" && <span title={row.error} className="text-destructive">Error</span>}{row.status !== "success" && <button type="button" onClick={() => removeRow(row.key)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}</div></td></tr>)}</tbody></table></div>
            </>
          )}
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void loadFile(file); event.target.value = ""; }} />
        </div>
        <DialogFooter className="border-t border-border justify-end"><Button variant="outline" onClick={onClose} disabled={importing}>Close</Button>{rows.length > 0 && <Button onClick={() => void importRows()} disabled={importing || pending === 0}>{importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import {pending} Row{pending === 1 ? "" : "s"}</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RealignmentPage() {
  const [entries, setEntries] = useState<RealignmentEntry[]>([]);
  const [saros, setSaros] = useState<ReceivedSARO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<RealignmentEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [realignments, receivedSaros] = await Promise.all([
        realignmentApi.list({ archived: showArchived }),
        receivedSaroApi.list(),
      ]);
      setEntries(realignments);
      setSaros(receivedSaros);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [showArchived]);

  const filtered = useMemo(() => entries.filter((entry) => {
    const query = search.trim().toLowerCase();
    const searchable = [entry.saro_no, entry.realignment_ref, entry.account_code, entry.account_title, entry.pap_name, entry.fund, entry.class_type].join(" ").toLowerCase();
    return (!query || searchable.includes(query)) && (!monthFilter || entry.month === monthFilter);
  }), [entries, search, monthFilter]);
  const months = useMemo(() => [...new Set(entries.map((entry) => entry.month))].sort().reverse(), [entries]);
  const totalTo = filtered.reduce((total, entry) => total + amount(entry.transfer_to), 0);
  const totalFrom = filtered.reduce((total, entry) => total + amount(entry.transfer_from), 0);
  const balanced = Math.abs(totalTo - totalFrom) < 0.01;
  const groups = useMemo(() => {
    const grouped = new Map<string, RealignmentEntry[]>();
    filtered.forEach((entry) => grouped.set(entry.realignment_ref, [...(grouped.get(entry.realignment_ref) || []), entry]));
    return grouped;
  }, [filtered]);
  const allSelected = filtered.length > 0 && filtered.every((entry) => selected.has(entry.id));

  const toggle = (id: number) => setSelected((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const actOn = async (action: "archive" | "restore" | "delete", ids: number[]) => {
    if (!ids.length || !window.confirm(`${action === "delete" ? "Delete" : action === "archive" ? "Archive" : "Restore"} ${ids.length} selected realignment entr${ids.length === 1 ? "y" : "ies"}?`)) return;
    await realignmentApi.bulkAction(action, ids);
    await load();
  };

  return (
    <AdminLayout title="Realignment" subtitle="Modification and Adjustment Plan (MAP) fund transfer records">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={showArchived ? "outline" : "default"} size="sm" onClick={() => setShowArchived(false)}>Active</Button>
            <Button variant={showArchived ? "secondary" : "outline"} size="sm" onClick={() => setShowArchived(true)}><Archive className="mr-1 h-3.5 w-3.5" />Archived</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.size > 0 && <><Button size="sm" variant="outline" onClick={() => void actOn(showArchived ? "restore" : "archive", [...selected])}>{showArchived ? <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> : <Archive className="mr-1 h-3.5 w-3.5" />}{showArchived ? "Restore" : "Archive"} ({selected.size})</Button><Button size="sm" variant="destructive" onClick={() => void actOn("delete", [...selected])}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete ({selected.size})</Button></>}
            {!showArchived && <><Button size="sm" variant="outline" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-3.5 w-3.5" />Import</Button><Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-1 h-3.5 w-3.5" />Add Entry</Button></>}
          </div>
        </div>
        {!showArchived && <div className="grid grid-cols-3 gap-3 sm:grid-cols-1"><SummaryCard label="Transfer To (+)" value={formatMoney(totalTo)} tone="text-emerald-600" /><SummaryCard label="Transfer From (-)" value={formatMoney(totalFrom)} tone="text-red-600" /><SummaryCard label="Balance" value={balanced ? "Balanced" : `${formatMoney(Math.abs(totalTo - totalFrom))} off`} tone={balanced ? "text-primary" : "text-amber-600"} /></div>}
        <div className="flex flex-wrap gap-2"><div className="relative min-w-[250px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search SARO, MAP reference, account…" /></div><select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">All months</option>{months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select></div>
        {loading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading realignment records…</div> : filtered.length === 0 ? <div className="py-16 text-center text-sm text-muted-foreground">No {showArchived ? "archived " : ""}realignment records found.</div> : <div className="overflow-x-auto rounded-xl border border-border"><table className="min-w-[1200px] w-full text-sm"><thead className={showArchived ? "bg-amber-600 text-white" : "bg-primary text-primary-foreground"}><tr><th className="w-10 px-3 py-3"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((entry) => entry.id)))} /></th>{["Month", "Fund", "Class", "PAP Name", "SARO No.", "MAP Reference", "Account Code", "Account Title", "Transfer To", "Transfer From", ""].map((label) => <th key={label} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide">{label}</th>)}</tr></thead><tbody>{[...groups.entries()].flatMap(([reference, rows]) => rows.map((entry, index) => { const groupTo = rows.reduce((total, item) => total + amount(item.transfer_to), 0); const groupFrom = rows.reduce((total, item) => total + amount(item.transfer_from), 0); const groupBalanced = Math.abs(groupTo - groupFrom) < 0.01; return <tr key={entry.id} className="border-t border-border hover:bg-muted/40"><td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggle(entry.id)} /></td><td className="px-3 py-2.5">{monthLabel(entry.month)}</td><td className="px-3 py-2.5">{entry.fund || "—"}</td><td className="px-3 py-2.5">{entry.class_type || "—"}</td><td className="max-w-[180px] truncate px-3 py-2.5" title={entry.pap_name}>{entry.pap_name || "—"}</td><td className="px-3 py-2.5 font-medium">{entry.saro_no}</td><td className="px-3 py-2.5"><span className="font-medium">{reference}</span>{index === rows.length - 1 && <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${groupBalanced ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{groupBalanced ? "BAL" : "UNBAL"}</span>}</td><td className="px-3 py-2.5 text-primary">{entry.account_code}</td><td className="max-w-[220px] truncate px-3 py-2.5" title={entry.account_title}>{entry.account_title || "—"}</td><td className="px-3 py-2.5 text-right font-medium text-emerald-600">{amount(entry.transfer_to) ? formatMoney(entry.transfer_to) : "—"}</td><td className="px-3 py-2.5 text-right font-medium text-red-600">{amount(entry.transfer_from) ? formatMoney(entry.transfer_from) : "—"}</td><td className="px-3 py-2.5">{!showArchived && <div className="flex gap-1"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(entry); setFormOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void actOn("archive", [entry.id])}><Archive className="h-3.5 w-3.5" /></Button></div>}{showArchived && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void actOn("restore", [entry.id])}><ArchiveRestore className="h-3.5 w-3.5" /></Button>}</td></tr>; }))}<tr className="border-t-2 border-border bg-muted/40"><td /><td colSpan={8} className="px-3 py-3 text-xs font-semibold uppercase">Total ({filtered.length} entries)</td><td className="px-3 py-3 text-right font-semibold text-emerald-600">{formatMoney(totalTo)}</td><td className="px-3 py-3 text-right font-semibold text-red-600">{formatMoney(totalFrom)}</td><td /></tr></tbody></table></div>}
      </div>
      <RealignmentFormDialog open={formOpen} entry={editing} saros={saros} onClose={() => setFormOpen(false)} onSaved={load} />
      <BulkImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
    </AdminLayout>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="rounded-xl border border-border bg-card px-4 py-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-semibold ${tone}`}>{value}</p></div>;
}
