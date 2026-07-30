import { useEffect, useState } from "react";
import { Search, Plus, Pencil, Trash2, Upload, AlertTriangle } from "lucide-react";
import Swal from "sweetalert2";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter,
} from "../../components/ui/drawer";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import { TableSkeleton } from "./Skeleton";
import {
  objectCodeApi, classTypeApi, fundSourceApi, papApi,
  ObjectCode, ClassType, FundSource, PAP, CodeNameImportRow,
  ClassTypeImportRow, ClassTypeImportResult,
  FundSourceImportRow, FundSourceImportResult,
} from "../../lib/referenceDataApi";
import { FUND_CLUSTER_OPTIONS } from "../../lib/ntcaApi";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

function extractError(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return "Failed to save. Please try again.";
  return Object.entries(data)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`)
    .join(" | ");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared bulk-import dialog (paste code/name pairs, preview, confirm) and
// clear-all confirmation — used by the PAP and Object Code tables, the two
// reference lists large enough to warrant wiping and re-seeding wholesale.
// ─────────────────────────────────────────────────────────────────────────
interface CodeNameBulkApi {
  previewImport: (text: string) => Promise<{ rows: CodeNameImportRow[]; warnings: string[] }>;
  confirmImport: (rows: CodeNameImportRow[]) => Promise<{ created: number; updated?: number }>;
}

function CodeNameBulkImportDialog({
  open, onOpenChange, title, codeLabel, nameLabel, api, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  codeLabel: string;
  nameLabel: string;
  api: CodeNameBulkApi;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<(CodeNameImportRow & { included: boolean })[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setRows(null);
      setWarnings([]);
      setError(null);
    }
  }, [open]);

  const handlePreview = async () => {
    if (!text.trim()) {
      setError("Paste some content first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.previewImport(text);
      setRows(result.rows.map((r) => ({ ...r, included: !r.is_duplicate })));
      setWarnings(result.warnings);
    } catch {
      setError("Could not parse this. Each line should be \"code<TAB or comma>name\".");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.confirmImport(rows.filter((r) => r.included));
      const parts = [`${result.created} created`];
      if (result.updated) parts.push(`${result.updated} updated`);
      Swal.fire({ icon: "success", title: "Import complete", text: parts.join(", "), ...swalTheme });
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
      <DialogContent className="max-w-3xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Bulk Import {title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Paste rows — one per line, {codeLabel} then {nameLabel} (tab or comma separated). A header row is detected and skipped automatically.
            </label>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setRows(null); }}
              rows={10}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              placeholder={`${codeLabel}\t${nameLabel}\n100000100001000\tGeneral Management and Supervision`}
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
                {rows.filter((r) => r.is_duplicate).length} look already present,{" "}
                {rows.filter((r) => r.included).length} selected to import.
              </p>
              {warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-xs rounded-lg px-3 py-2 flex flex-col gap-1">
                  {warnings.map((w, i) => <span key={i}>{w}</span>)}
                </div>
              )}
              <div className="border border-border rounded-lg overflow-hidden max-h-[45vh] overflow-y-auto">
                <div className="grid grid-cols-[24px_160px_1fr] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">
                  <span />
                  <span>{codeLabel}</span>
                  <span>{nameLabel}</span>
                </div>
                {rows.map((r, i) => (
                  <div key={i} className={`grid grid-cols-[24px_160px_1fr] gap-3 px-3 py-2 border-b border-border last:border-0 items-center text-sm ${r.is_duplicate ? "opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      checked={r.included}
                      onChange={() => setRows((prev) => prev && prev.map((x, j) => (j === i ? { ...x, included: !x.included } : x)))}
                    />
                    <span className="font-mono text-xs text-foreground truncate">{r.code}</span>
                    <span className="text-xs text-foreground truncate">{r.name}{r.is_duplicate && <span className="text-muted-foreground"> · looks already present</span>}</span>
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

async function confirmClearAll(title: string, count: number, clearAll: () => Promise<{ deleted: number }>, onCleared: () => void) {
  const result = await Swal.fire({
    icon: "warning",
    title: `Delete all ${count} ${title} entries?`,
    html: `This permanently deletes every row in the ${title} reference list. It does <strong>not</strong> affect any SARO, Received SARO, or NTCA records already saved — those store their own text, not a link to this table. This cannot be undone.`,
    showCancelButton: true,
    confirmButtonText: "Delete all",
    confirmButtonColor: "#dc2626",
    ...swalTheme,
  });
  if (!result.isConfirmed) return;
  const { deleted } = await clearAll();
  Swal.fire({ icon: "success", title: `Deleted ${deleted} entries`, timer: 1300, showConfirmButton: false, ...swalTheme });
  onCleared();
}

// ─────────────────────────────────────────────────────────────────────────
// Class Type bulk-import dialog (with money range fields)
// ─────────────────────────────────────────────────────────────────────────
function ClassTypeBulkImportDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<(ClassTypeImportRow & { included: boolean })[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setText(""); setRows(null); setWarnings([]); setError(null); } }, [open]);

  const handlePreview = async () => {
    if (!text.trim()) { setError("Paste some content first."); return; }
    setBusy(true); setError(null);
    try {
      const result = await classTypeApi.previewImport(text);
      setRows(result.rows.map((r) => ({ ...r, included: !r.is_duplicate })));
      setWarnings(result.warnings);
    } catch { setError("Could not parse this. Each line should be \"code<TAB or comma>name<money_min>money_max\"."); }
    finally { setBusy(false); }
  };

  const handleConfirm = async () => {
    if (!rows) return;
    setBusy(true); setError(null);
    try {
      const result = await classTypeApi.confirmImport(rows.filter((r) => r.included));
      const parts = [`${result.created} created`];
      if (result.updated) parts.push(`${result.updated} updated`);
      Swal.fire({ icon: "success", title: "Import complete", text: parts.join(", "), ...swalTheme });
      onImported(); onOpenChange(false);
    } catch { setError("Import failed. Nothing further was written for this batch."); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="border-b border-border"><DialogTitle>Bulk Import Class Type</DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Paste rows — one per line, Code then Name then Money Range Min then Money Range Max (tab or comma separated). A header row is detected and skipped automatically.
            </label>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setRows(null); }} rows={10}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              placeholder="CODE\tNAME\tMIN\tMAX\nPS\tPersonal Services\t0\t1000000\nMOOE\tMaintenance and Other Operating Expenses\t0\t500000\nCO\tCapital Outlay\t0\t10000000"
            />
          </div>
          <div><Button type="button" variant="outline" className="text-foreground" onClick={handlePreview} disabled={busy}>{busy && !rows ? "Parsing…" : "Preview"}</Button></div>
          {rows && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-foreground">Found <strong>{rows.length}</strong> row(s) — {rows.filter((r) => r.is_duplicate).length} look already present, {rows.filter((r) => r.included).length} selected to import.</p>
              {warnings.length > 0 && <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-xs rounded-lg px-3 py-2 flex flex-col gap-1">{warnings.map((w, i) => <span key={i}>{w}</span>)}</div>}
              <div className="border border-border rounded-lg overflow-hidden max-h-[45vh] overflow-y-auto">
                <div className="grid grid-cols-[24px_140px_1fr_140px_140px] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">
                  <span /><span>Code</span><span>Name</span><span>Min</span><span>Max</span>
                </div>
                {rows.map((r, i) => (
                  <div key={i} className={`grid grid-cols-[24px_140px_1fr_140px_140px] gap-3 px-3 py-2 border-b border-border last:border-0 items-center text-sm ${r.is_duplicate ? "opacity-60" : ""}`}>
                    <input type="checkbox" checked={r.included} onChange={() => setRows((prev) => prev && prev.map((x, j) => (j === i ? { ...x, included: !x.included } : x)))} />
                    <span className="font-mono text-xs text-foreground truncate">{r.code}</span>
                    <span className="text-xs text-foreground truncate">{r.name}{r.is_duplicate && <span className="text-muted-foreground"> · looks already present</span>}</span>
                    <span className="text-xs text-foreground truncate">{r.money_range_min ?? ""}</span>
                    <span className="text-xs text-foreground truncate">{r.money_range_max ?? ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || !rows || !rows.some((r) => r.included)}>{busy && rows ? "Importing…" : "Confirm & Import"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Fund Source bulk-import dialog (with SAGF fields)
// ─────────────────────────────────────────────────────────────────────────
function FundSourceBulkImportDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<(FundSourceImportRow & { included: boolean })[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setText(""); setRows(null); setWarnings([]); setError(null); } }, [open]);

  const handlePreview = async () => {
    if (!text.trim()) { setError("Paste some content first."); return; }
    setBusy(true); setError(null);
    try {
      const result = await fundSourceApi.previewImport(text);
      setRows(result.rows.map((r) => ({ ...r, included: !r.is_duplicate })));
      setWarnings(result.warnings);
    } catch { setError("Could not parse this. Each line should be \"code<TAB or comma>name<is_sagf>sagf_type\"."); }
    finally { setBusy(false); }
  };

  const handleConfirm = async () => {
    if (!rows) return;
    setBusy(true); setError(null);
    try {
      const result = await fundSourceApi.confirmImport(rows.filter((r) => r.included));
      const parts = [`${result.created} created`];
      if (result.updated) parts.push(`${result.updated} updated`);
      Swal.fire({ icon: "success", title: "Import complete", text: parts.join(", "), ...swalTheme });
      onImported(); onOpenChange(false);
    } catch { setError("Import failed. Nothing further was written for this batch."); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="border-b border-border"><DialogTitle>Bulk Import Fund Source</DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Paste rows — one per line, Code then Name then Is SAGF then SAGF Type (tab or comma separated). A header row is detected and skipped automatically.
            </label>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setRows(null); }} rows={10}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              placeholder="CODE\tNAME\tIS_SAGF\tSAGF_TYPE\n01101101\tCurrent Approp\tfalse\t\n01102101\tContinuing Approp\tfalse\t\n01104102\tPension and Gratuity\ttrue\tautomatic"
            />
          </div>
          <div><Button type="button" variant="outline" className="text-foreground" onClick={handlePreview} disabled={busy}>{busy && !rows ? "Parsing…" : "Preview"}</Button></div>
          {rows && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-foreground">Found <strong>{rows.length}</strong> row(s) — {rows.filter((r) => r.is_duplicate).length} look already present, {rows.filter((r) => r.included).length} selected to import.</p>
              {warnings.length > 0 && <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-xs rounded-lg px-3 py-2 flex flex-col gap-1">{warnings.map((w, i) => <span key={i}>{w}</span>)}</div>}
              <div className="border border-border rounded-lg overflow-hidden max-h-[45vh] overflow-y-auto">
                <div className="grid grid-cols-[24px_140px_1fr_80px_120px] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">
                  <span /><span>Code</span><span>Name</span><span>Is SAGF</span><span>SAGF Type</span>
                </div>
                {rows.map((r, i) => (
                  <div key={i} className={`grid grid-cols-[24px_140px_1fr_80px_120px] gap-3 px-3 py-2 border-b border-border last:border-0 items-center text-sm ${r.is_duplicate ? "opacity-60" : ""}`}>
                    <input type="checkbox" checked={r.included} onChange={() => setRows((prev) => prev && prev.map((x, j) => (j === i ? { ...x, included: !x.included } : x)))} />
                    <span className="font-mono text-xs text-foreground truncate">{r.code}</span>
                    <span className="text-xs text-foreground truncate">{r.name}{r.is_duplicate && <span className="text-muted-foreground"> · looks already present</span>}</span>
                    <span className="text-xs text-foreground truncate">{r.is_sagf ? "Yes" : "No"}</span>
                    <span className="text-xs text-foreground truncate">{r.sagf_type ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || !rows || !rows.some((r) => r.included)}>{busy && rows ? "Importing…" : "Confirm & Import"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Generic code + name (+ optional extra fields) lookup table
// ─────────────────────────────────────────────────────────────────────────
interface ExtraField {
  id: number;
  key: string;
  label: string;
  type: "text" | "number" | "checkbox" | "select";
  options?: { value: string; label: string }[];
  showIf?: (values: Record<string, unknown>) => boolean;
}

interface LookupItem {
  id: number;
  [key: string]: unknown;
}

interface LookupApi<T> {
  list: () => Promise<T[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (payload: any) => Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (id: number, payload: any) => Promise<T>;
  remove: (id: number) => Promise<void>;
}

function LookupTable<T extends LookupItem>({
  title, codeKey, codeLabel, nameKey, nameLabel, extraFields = [], api,
}: {
  title: string;
  codeKey: string;
  codeLabel: string;
  nameKey: string;
  nameLabel: string;
  extraFields?: ExtraField[];
  api: LookupApi<T>;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await api.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emptyValues = (): Record<string, unknown> => {
    const v: Record<string, unknown> = { [codeKey]: "", [nameKey]: "" };
    extraFields.forEach((f) => { v[f.key] = f.type === "checkbox" ? false : ""; });
    return v;
  };

  const openAdd = () => { setEditing(null); setValues(emptyValues()); setError(null); setFormOpen(true); };
  const openEdit = (item: T) => {
    setEditing(item);
    const record = item as unknown as Record<string, unknown>;
    const v: Record<string, unknown> = { [codeKey]: record[codeKey], [nameKey]: record[nameKey] };
    extraFields.forEach((f) => { v[f.key] = record[f.key] ?? (f.type === "checkbox" ? false : ""); });
    setValues(v);
    setError(null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!String(values[codeKey] ?? "").trim() || !String(values[nameKey] ?? "").trim()) {
      setError(`${codeLabel} and ${nameLabel} are required.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        [codeKey]: String(values[codeKey]).trim(),
        [nameKey]: String(values[nameKey]).trim(),
      };
      extraFields.forEach((f) => {
        if (f.showIf && !f.showIf(values)) {
          payload[f.key] = f.type === "checkbox" ? false : null;
          return;
        }
        const v = values[f.key];
        payload[f.key] = v === "" || v === undefined ? null : v;
      });
      if (editing) await api.update(editing.id, payload);
      else await api.create(payload);
      Swal.fire({ icon: "success", title: editing ? "Updated" : "Added", timer: 1100, showConfirmButton: false, ...swalTheme });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: T) => {
    const record = item as unknown as Record<string, unknown>;
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete ${record[codeKey]}?`,
      text: "This cannot be undone.",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await api.remove(item.id);
    load();
  };

  const filtered = items.filter((i) => {
    const record = i as unknown as Record<string, unknown>;
    const q = search.toLowerCase();
    if (!q) return true;
    return String(record[codeKey]).toLowerCase().includes(q) || String(record[nameKey]).toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}...`}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <Button size="sm" onClick={openAdd} className="ml-auto">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>

      {loading ? <TableSkeleton rows={4} /> : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[140px_1fr_70px] gap-3 px-4 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{codeLabel}</span>
            <span>{nameLabel}</span>
            <span />
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">No entries.</div>
            ) : (
              filtered.map((item) => {
                const record = item as unknown as Record<string, unknown>;
                return (
                  <div key={item.id} className="grid grid-cols-[140px_1fr_70px] gap-3 px-4 py-2.5 border-b border-border last:border-0 items-center text-sm hover:bg-accent/30 transition-colors">
                    <span className="font-mono text-xs text-foreground truncate">{String(record[codeKey])}</span>
                    <span className="text-foreground truncate">{String(record[nameKey])}</span>
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(item)} className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item)} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{filtered.length} of {items.length}</p>

      <Drawer open={formOpen} onOpenChange={setFormOpen}>
        <DrawerContent>
          <DrawerHeader className="border-b border-border">
            <DrawerTitle>{editing ? `Edit ${title}` : `Add ${title}`}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-4 flex flex-col gap-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
            )}
            <Field label={codeLabel}>
              <Input value={String(values[codeKey] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [codeKey]: e.target.value }))} />
            </Field>
            <Field label={nameLabel}>
              <Input value={String(values[nameKey] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [nameKey]: e.target.value }))} />
            </Field>
            {extraFields.filter((f) => !f.showIf || f.showIf(values)).map((f) => (
              <Field key={f.key} label={f.label}>
                {f.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={!!values[f.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                    className="h-4 w-4"
                  />
                ) : f.type === "select" ? (
                  <select
                    value={String(values[f.key] ?? "")}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                  >
                    <option value="">—</option>
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <Input
                    type={f.type}
                    step={f.type === "number" ? "0.01" : undefined}
                    value={String(values[f.key] ?? "")}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                )}
              </Field>
            ))}
          </div>
          <DrawerFooter className="border-t border-border flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PAP table — code + name, with optional Fund Source / Class Type scoping
// (a PAP code can legitimately repeat under different fund/class combos)
// ─────────────────────────────────────────────────────────────────────────
function PapTable() {
  const [items, setItems] = useState<PAP[]>([]);
  const [fundSources, setFundSources] = useState<FundSource[]>([]);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<PAP | null>(null);
  const [form, setForm] = useState({ code: "", name: "", particular: "", fund: "", class_type: "", fund_cluster: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [paps, funds, classes] = await Promise.all([papApi.list(), fundSourceApi.list(), classTypeApi.list()]);
      setItems(paps);
      setFundSources(funds);
      setClassTypes(classes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    // Most PAPs end up tagged MDS Regular — default to it so adding one
    // rarely needs a manual pick, while editing still shows the real value.
    setForm({ code: "", name: "", particular: "", fund: "", class_type: "", fund_cluster: "mds_regular" });
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (item: PAP) => {
    setEditing(item);
    setForm({
      code: item.code,
      name: item.name,
      particular: item.particular,
      fund: item.fund ? String(item.fund) : "",
      class_type: item.class_type ? String(item.class_type) : "",
      fund_cluster: item.fund_cluster || "",
    });
    setError(null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("PAP Code and PAP Name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        particular: form.particular.trim(),
        fund: form.fund ? Number(form.fund) : null,
        class_type: form.class_type ? Number(form.class_type) : null,
        fund_cluster: form.fund_cluster as PAP["fund_cluster"],
      };
      if (editing) await papApi.update(editing.id, payload);
      else await papApi.create(payload);
      Swal.fire({ icon: "success", title: editing ? "Updated" : "Added", timer: 1100, showConfirmButton: false, ...swalTheme });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: PAP) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${item.code}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await papApi.remove(item.id);
    load();
  };

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PAP code or name..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <div className="flex gap-2 ml-auto">
          <Button size="sm" variant="outline" className="text-foreground" onClick={() => setImportOpen(true)}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Bulk Import
          </Button>
          <Button size="sm" variant="outline" className="text-foreground" onClick={() => confirmClearAll("PAP", items.length, papApi.clearAll, load)} disabled={items.length === 0}>
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Clear All
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>

      {loading ? <TableSkeleton rows={4} /> : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[160px_1fr_160px_120px_70px] gap-3 px-4 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>PAP Code</span>
            <span>PAP Name</span>
            <span>Fund / Class</span>
            <span>Fund Cluster</span>
            <span />
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">No entries.</div>
            ) : (
              filtered.map((item) => (
                <div key={item.id} className="grid grid-cols-[160px_1fr_160px_120px_70px] gap-3 px-4 py-2.5 border-b border-border last:border-0 items-center text-sm hover:bg-accent/30 transition-colors">
                  <span className="font-mono text-xs text-foreground truncate">{item.code}</span>
                  <span className="text-foreground truncate">{item.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {[item.fund_detail?.name, item.class_type_detail?.name].filter(Boolean).join(" / ") || "—"}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {FUND_CLUSTER_OPTIONS.find((o) => o.value === item.fund_cluster)?.label || "—"}
                  </span>
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(item)} className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(item)} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{filtered.length} of {items.length}</p>

      <Drawer open={formOpen} onOpenChange={setFormOpen}>
        <DrawerContent>
          <DrawerHeader className="border-b border-border">
            <DrawerTitle>{editing ? `Edit ${editing.code}` : "Add PAP"}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-4 flex flex-col gap-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
            )}
            <Field label="PAP Code *">
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </Field>
            <Field label="PAP Name *">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Particulars">
              <Input value={form.particular} onChange={(e) => setForm((f) => ({ ...f, particular: e.target.value }))} />
            </Field>
            <Field label="Fund Source (optional — leave blank if this PAP isn't scoped to one)">
              <select
                value={form.fund}
                onChange={(e) => setForm((f) => ({ ...f, fund: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              >
                <option value="">—</option>
                {fundSources.map((fs) => <option key={fs.id} value={fs.id}>{fs.code} — {fs.name}</option>)}
              </select>
            </Field>
            <Field label="Class Type (optional)">
              <select
                value={form.class_type}
                onChange={(e) => setForm((f) => ({ ...f, class_type: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              >
                <option value="">—</option>
                {classTypes.map((ct) => <option key={ct.id} value={ct.id}>{ct.code} — {ct.name}</option>)}
              </select>
            </Field>
            <Field label="Fund Cluster (optional — tags this PAP so NTCA entries under this code auto-fill MDS Regular/Special)">
              <select
                value={form.fund_cluster}
                onChange={(e) => setForm((f) => ({ ...f, fund_cluster: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              >
                <option value="">—</option>
                {FUND_CLUSTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          <DrawerFooter className="border-t border-border flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <CodeNameBulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="PAP"
        codeLabel="PAP Code"
        nameLabel="PAP Name"
        api={papApi}
        onImported={load}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Object Code table — uses the generic LookupTable but layers bulk import
// + clear-all on top (it's the other list large enough to warrant wiping
// and re-seeding wholesale), matching the PAP table's affordances.
// ─────────────────────────────────────────────────────────────────────────
function ObjectCodeTable() {
  const [items, setItems] = useState<ObjectCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ObjectCode | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({ code: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await objectCodeApi.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = () => {
    setEditing(null);
    setValues({ code: "", description: "" });
    setError(null);
    setFormOpen(true);
  };
  const openEdit = (item: ObjectCode) => {
    setEditing(item);
    setValues({ code: item.code, description: item.description });
    setError(null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!String(values.code ?? "").trim() || !String(values.description ?? "").trim()) {
      setError("Object Code and Description are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { code: String(values.code).trim(), description: String(values.description).trim() };
      if (editing) await objectCodeApi.update(editing.id, payload);
      else await objectCodeApi.create(payload);
      Swal.fire({ icon: "success", title: editing ? "Updated" : "Added", timer: 1100, showConfirmButton: false, ...swalTheme });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ObjectCode) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${item.code}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await objectCodeApi.remove(item.id);
    load();
  };

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return i.code.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search object code or description..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <div className="flex gap-2 ml-auto">
          <Button size="sm" variant="outline" className="text-foreground" onClick={() => setImportOpen(true)}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Bulk Import
          </Button>
          <Button size="sm" variant="outline" className="text-foreground" onClick={() => confirmClearAll("Object Code", items.length, objectCodeApi.clearAll, load)} disabled={items.length === 0}>
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Clear All
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>

      {loading ? <TableSkeleton rows={4} /> : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[160px_1fr_70px] gap-3 px-4 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Object Code</span>
            <span>Description</span>
            <span />
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">No entries.</div>
            ) : (
              filtered.map((item) => (
                <div key={item.id} className="grid grid-cols-[160px_1fr_70px] gap-3 px-4 py-2.5 border-b border-border last:border-0 items-center text-sm hover:bg-accent/30 transition-colors">
                  <span className="font-mono text-xs text-foreground truncate">{item.code}</span>
                  <span className="text-foreground truncate">{item.description}</span>
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(item)} className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(item)} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{filtered.length} of {items.length}</p>

      <Drawer open={formOpen} onOpenChange={setFormOpen}>
        <DrawerContent>
          <DrawerHeader className="border-b border-border">
            <DrawerTitle>{editing ? `Edit ${editing.code}` : "Add Object Code"}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-4 flex flex-col gap-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
            )}
            <Field label="Object Code *">
              <Input value={String(values.code ?? "")} onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))} />
            </Field>
            <Field label="Description *">
              <Input value={String(values.description ?? "")} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} />
            </Field>
          </div>
          <DrawerFooter className="border-t border-border flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <CodeNameBulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Object Code"
        codeLabel="Object Code"
        nameLabel="Description"
        api={{ previewImport: objectCodeApi.previewImport, confirmImport: objectCodeApi.confirmImport }}
        onImported={load}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Class Type table — with bulk import + clear all
// ─────────────────────────────────────────────────────────────────────────
function ClassTypeTable() {
  const [items, setItems] = useState<ClassType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ClassType | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({ code: "", name: "", money_range_min: "", money_range_max: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await classTypeApi.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setValues({ code: "", name: "", money_range_min: "", money_range_max: "" });
    setError(null);
    setFormOpen(true);
  };
  const openEdit = (item: ClassType) => {
    setEditing(item);
    setValues({ code: item.code, name: item.name, money_range_min: item.money_range_min ?? "", money_range_max: item.money_range_max ?? "" });
    setError(null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!String(values.code ?? "").trim() || !String(values.name ?? "").trim()) {
      setError("Code and Name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: String(values.code).trim(),
        name: String(values.name).trim(),
        money_range_min: String(values.money_range_min).trim() || null,
        money_range_max: String(values.money_range_max).trim() || null,
      };
      if (editing) await classTypeApi.update(editing.id, payload);
      else await classTypeApi.create(payload);
      Swal.fire({ icon: "success", title: editing ? "Updated" : "Added", timer: 1100, showConfirmButton: false, ...swalTheme });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ClassType) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${item.code}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await classTypeApi.remove(item.id);
    load();
  };

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Class Type code or name..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <div className="flex gap-2 ml-auto">
          <Button size="sm" variant="outline" className="text-foreground" onClick={() => setImportOpen(true)}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Bulk Import
          </Button>
          <Button size="sm" variant="outline" className="text-foreground" onClick={() => confirmClearAll("Class Type", items.length, classTypeApi.clearAll, load)} disabled={items.length === 0}>
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Clear All
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>

      {loading ? <TableSkeleton rows={4} /> : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[140px_1fr_140px_70px] gap-3 px-4 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Code</span>
            <span>Name</span>
            <span>Money Range</span>
            <span />
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">No entries.</div>
            ) : (
              filtered.map((item) => (
                <div key={item.id} className="grid grid-cols-[140px_1fr_140px_70px] gap-3 px-4 py-2.5 border-b border-border last:border-0 items-center text-sm hover:bg-accent/30 transition-colors">
                  <span className="font-mono text-xs text-foreground truncate">{item.code}</span>
                  <span className="text-foreground truncate">{item.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {item.money_range_min != null && item.money_range_max != null
                      ? `${Number(item.money_range_min).toLocaleString()} - ${Number(item.money_range_max).toLocaleString()}`
                      : item.money_range_min != null
                        ? `Min: ${Number(item.money_range_min).toLocaleString()}`
                        : item.money_range_max != null
                          ? `Max: ${Number(item.money_range_max).toLocaleString()}`
                          : "—"}
                  </span>
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(item)} className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(item)} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{filtered.length} of {items.length}</p>

      <Drawer open={formOpen} onOpenChange={setFormOpen}>
        <DrawerContent>
          <DrawerHeader className="border-b border-border">
            <DrawerTitle>{editing ? `Edit ${editing.code}` : "Add Class Type"}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-4 flex flex-col gap-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
            )}
            <Field label="Code *">
              <Input value={String(values.code ?? "")} onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))} />
            </Field>
            <Field label="Name *">
              <Input value={String(values.name ?? "")} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
            </Field>
            <Field label="Money Range Min (optional)">
              <Input type="number" step="0.01" value={String(values.money_range_min ?? "")} onChange={(e) => setValues((v) => ({ ...v, money_range_min: e.target.value }))} />
            </Field>
            <Field label="Money Range Max (optional)">
              <Input type="number" step="0.01" value={String(values.money_range_max ?? "")} onChange={(e) => setValues((v) => ({ ...v, money_range_max: e.target.value }))} />
            </Field>
          </div>
          <DrawerFooter className="border-t border-border flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <CodeNameBulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Class Type"
        codeLabel="Code"
        nameLabel="Name"
        api={{ previewImport: classTypeApi.previewImport, confirmImport: classTypeApi.confirmImport }}
        onImported={load}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Fund Source table — with bulk import + clear all
// ─────────────────────────────────────────────────────────────────────────
function FundSourceTable() {
  const [items, setItems] = useState<FundSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<FundSource | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({ code: "", name: "", is_sagf: false, sagf_type: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await fundSourceApi.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setValues({ code: "", name: "", is_sagf: false, sagf_type: "" });
    setError(null);
    setFormOpen(true);
  };
  const openEdit = (item: FundSource) => {
    setEditing(item);
    setValues({ code: item.code, name: item.name, is_sagf: item.is_sagf, sagf_type: item.sagf_type ?? "" });
    setError(null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!String(values.code ?? "").trim() || !String(values.name ?? "").trim()) {
      setError("Code and Name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rawSagf = String(values.sagf_type ?? "").trim();
      const sagfType: "continuing" | "automatic" | null =
        values.is_sagf && (rawSagf === "continuing" || rawSagf === "automatic") ? rawSagf : null;
      const payload = {
        code: String(values.code).trim(),
        name: String(values.name).trim(),
        is_sagf: !!values.is_sagf,
        sagf_type: sagfType,
      };
      if (editing) await fundSourceApi.update(editing.id, payload);
      else await fundSourceApi.create(payload);
      Swal.fire({ icon: "success", title: editing ? "Updated" : "Added", timer: 1100, showConfirmButton: false, ...swalTheme });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: FundSource) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${item.code}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await fundSourceApi.remove(item.id);
    load();
  };

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Fund Source code or name..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <div className="flex gap-2 ml-auto">
          <Button size="sm" variant="outline" className="text-foreground" onClick={() => setImportOpen(true)}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Bulk Import
          </Button>
          <Button size="sm" variant="outline" className="text-foreground" onClick={() => confirmClearAll("Fund Source", items.length, fundSourceApi.clearAll, load)} disabled={items.length === 0}>
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Clear All
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>

      {loading ? <TableSkeleton rows={4} /> : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[140px_1fr_140px_70px] gap-3 px-4 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Code</span>
            <span>Name</span>
            <span>SAGF</span>
            <span />
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">No entries.</div>
            ) : (
              filtered.map((item) => (
                <div key={item.id} className="grid grid-cols-[140px_1fr_140px_70px] gap-3 px-4 py-2.5 border-b border-border last:border-0 items-center text-sm hover:bg-accent/30 transition-colors">
                  <span className="font-mono text-xs text-foreground truncate">{item.code}</span>
                  <span className="text-foreground truncate">{item.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {item.is_sagf ? (item.sagf_type ? `Yes (${item.sagf_type})` : "Yes") : "No"}
                  </span>
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(item)} className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(item)} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{filtered.length} of {items.length}</p>

      <Drawer open={formOpen} onOpenChange={setFormOpen}>
        <DrawerContent>
          <DrawerHeader className="border-b border-border">
            <DrawerTitle>{editing ? `Edit ${editing.code}` : "Add Fund Source"}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-4 flex flex-col gap-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
            )}
            <Field label="Code *">
              <Input value={String(values.code ?? "")} onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))} />
            </Field>
            <Field label="Name *">
              <Input value={String(values.name ?? "")} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
            </Field>
            <Field label="Is SAGF">
              <input
                type="checkbox"
                checked={!!values.is_sagf}
                onChange={(e) => setValues((v) => ({ ...v, is_sagf: e.target.checked }))}
                className="h-4 w-4"
              />
            </Field>
            <Field label="SAGF Type">
              <select
                value={String(values.sagf_type ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, sagf_type: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              >
                <option value="">—</option>
                <option value="continuing">Continuing</option>
                <option value="automatic">Automatic</option>
              </select>
            </Field>
          </div>
          <DrawerFooter className="border-t border-border flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <CodeNameBulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Fund Source"
        codeLabel="Code"
        nameLabel="Name"
        api={{ previewImport: fundSourceApi.previewImport, confirmImport: fundSourceApi.confirmImport }}
        onImported={load}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main tabbed section, embedded in the Settings page
// ─────────────────────────────────────────────────────────────────────────
const TABS = ["PAP", "Class Type", "Fund Type", "Object Codes"] as const;
type Tab = typeof TABS[number];

const ReferenceDataSettings = () => {
  const [tab, setTab] = useState<Tab>("PAP");

  return (
    <section className="w-full bg-card border border-border rounded-xl p-6">
      <h2 className="text-sm font-semibold text-foreground mb-1">Budget Reference Data</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Manage the PAP, Class Type, Fund Type, and Object Code lookup lists used across the SARO / Received SARO forms.
      </p>

      <div className="flex gap-1 border-b border-border mb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "PAP" && <PapTable />}
      {tab === "Class Type" && <ClassTypeTable />}
      {tab === "Fund Type" && <FundSourceTable />}
      {tab === "Object Codes" && <ObjectCodeTable />}
    </section>
  );
};

export default ReferenceDataSettings;
