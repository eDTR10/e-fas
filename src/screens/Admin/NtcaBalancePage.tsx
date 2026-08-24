import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, AlertTriangle, Plus, Pencil, Trash2, Search,
} from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import { TableSkeleton } from "./Skeleton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import { SelectAllCheckbox } from "../../components/ui/select-all-checkbox";
import { BulkActionBar } from "../../components/ui/bulk-action-bar";
import { useSelection } from "../../lib/useSelection";
import { CategoryChip } from "../../components/ui/category-chip";
import { QuickFillSelect } from "../../components/ui/quick-fill-select";
import {
  ntcaBalanceApi, NtcaBalanceReport, NtcaBalanceFundCluster,
  NtcaBalanceCategoryReport, NtcaBalanceSaroReport, FUND_CLUSTER_OPTIONS,
} from "../../lib/ntcaBalanceApi";
import { FundCluster } from "../../lib/ntcaApi";
import { receivedSaroApi, ReceivedSARO } from "../../lib/receivedSaroApi";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

function extractError(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return "Failed to save. Please try again.";
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

const FUND_CLUSTER_TABS: { value: NtcaBalanceFundCluster; label: string }[] = [
  { value: "mds_regular", label: "MDS Regular" },
  { value: "mds_special", label: "MDS Special" },
  { value: "trust", label: "Trust" },
];

const QUARTER_LABELS = ["1st Qtr", "2nd Qtr", "3rd Qtr", "4th Qtr"];

// Shared by the header and every data row so columns always line up.
// Leading "24px 24px" is the select checkbox, then the expand chevron.
// "104px" right after SARO No. is the add/edit/delete action icons — kept
// near the front (not trailing after 15 numeric columns) so it's visible
// without scrolling the table horizontally.
const GRID_TEMPLATE_COLUMNS =
  "24px 24px minmax(160px, 1.3fr) minmax(200px, 1.6fr) minmax(110px, 1fr) 104px " +
  "repeat(4, 90px) 100px repeat(4, 90px) 100px repeat(4, 90px) 100px";

const formatMoney = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ─────────────────────────────────────────────────────────────────────────
// Add/rename a category — deliberately name+order only. Tagged SARO rows
// are managed inline in the report table itself (see SaroFormDialog) via
// their own standalone endpoint, so this never touches `saros` and never
// risks discarding another row's id (see ntcaBalanceApi.updateMeta).
// On a fresh Add (not Edit), the caller chains straight into "Tag a SARO"
// for the category just created — see NtcaBalancePage's onCategoryCreated.
// ─────────────────────────────────────────────────────────────────────────
function CategoryFormDialog({
  open, onOpenChange, editing, nextOrder, onSaved, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: NtcaBalanceCategoryReport | null;
  nextOrder: number;
  onSaved: () => void;
  onCreated: (categoryId: number, categoryName: string) => void;
}) {
  const [name, setName] = useState("");
  const [order, setOrder] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setOrder(String(editing?.order ?? nextOrder));
    setError(null);
  }, [open, editing, nextOrder]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Category name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await ntcaBalanceApi.updateMeta(editing.id, { name: name.trim(), order: Number(order) || 0 });
        Swal.fire({ icon: "success", title: "Category updated", timer: 1200, showConfirmButton: false, ...swalTheme });
        onOpenChange(false);
        onSaved();
      } else {
        const created = await ntcaBalanceApi.create({ name: name.trim(), order: Number(order) || 0, saros: [] });
        onOpenChange(false);
        onSaved();
        onCreated(created.id, created.name);
      }
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="border-b border-border">
          <DialogTitle>{editing ? `Edit "${editing.name}"` : "Add Category"}</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <Field label="Category Name *">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cybersecurity" />
            </Field>
            <Field label="Order">
              <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
            </Field>
          </div>
          {!editing && (
            <p className="text-xs text-muted-foreground">You'll be asked to tag its first SARO No. right after this.</p>
          )}
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
// Add/edit one tagged SARO No. under a category — a real standalone row,
// not a resubmission of the whole category (see ntcaBalanceApi.createSaro/
// updateSaro). `fundCluster` seeds the default tab tag on Add.
// ─────────────────────────────────────────────────────────────────────────
function SaroFormDialog({
  open, onOpenChange, categoryId, categoryName, editing, saroList, fundCluster, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: number | null;
  categoryName?: string;
  editing: NtcaBalanceSaroReport | null;
  saroList: ReceivedSARO[];
  fundCluster: NtcaBalanceFundCluster;
  onSaved: () => void;
}) {
  const [saroNo, setSaroNo] = useState("");
  const [pap, setPap] = useState("");
  const [purpose, setPurpose] = useState("");
  const [papCode, setPapCode] = useState("");
  const [classTypeLabel, setClassTypeLabel] = useState("");
  const [cluster, setCluster] = useState<FundCluster | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSaroNo(editing?.saro_no ?? "");
    setPap(editing?.pap ?? "");
    setPurpose(editing?.purpose ?? "");
    setPapCode(editing?.pap_code ?? "");
    setClassTypeLabel(editing?.class_type_label ?? "");
    setCluster(editing || fundCluster === "unclassified" ? "" : fundCluster);
    setError(null);
  }, [open, editing, fundCluster]);

  const pickSaro = (s: ReceivedSARO) => {
    setSaroNo(s.saro_no);
    if (s.pap_name) setPap(s.pap_name);
    if (s.particulars) setPurpose(s.particulars);
    if (s.pap_code) setPapCode(s.pap_code);
    if (s.class_type_label) setClassTypeLabel(s.class_type_label);
  };

  const handleSubmit = async () => {
    if (!saroNo.trim()) {
      setError("SARO No. is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await ntcaBalanceApi.updateSaro(editing.id, {
          saro_no: saroNo.trim(), pap, purpose, pap_code: papCode, class_type_label: classTypeLabel,
        });
      } else {
        if (categoryId === null) throw new Error("No category selected.");
        await ntcaBalanceApi.createSaro({
          category: categoryId, saro_no: saroNo.trim(), pap, purpose, pap_code: papCode,
          class_type_label: classTypeLabel, default_fund_cluster: cluster,
        });
      }
      Swal.fire({ icon: "success", title: editing ? "SARO updated" : "SARO tagged", timer: 1200, showConfirmButton: false, ...swalTheme });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="border-b border-border">
          <DialogTitle>{editing ? `Edit SARO ${editing.saro_no}` : `Tag a SARO No.${categoryName ? ` — ${categoryName}` : ""}`}</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 flex flex-col gap-3">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}
          <Field label="SARO No. *">
            <QuickFillSelect
              placeholder="Pick from Received SARO list…"
              items={saroList}
              getLabel={(s) => `${s.saro_no} — ${s.pap_name || "(no PAP name)"}`}
              onPick={pickSaro}
            />
            <Input value={saroNo} onChange={(e) => setSaroNo(e.target.value)} placeholder="SARO No." />
          </Field>
          <Field label="PAP">
            <Input value={pap} onChange={(e) => setPap(e.target.value)} />
          </Field>
          <Field label="Purpose">
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="PAP Code">
              <Input value={papCode} onChange={(e) => setPapCode(e.target.value)} />
            </Field>
            <Field label="Class Type">
              <Input value={classTypeLabel} onChange={(e) => setClassTypeLabel(e.target.value)} />
            </Field>
          </div>
          {!editing && (
            <Field label="Fund Cluster (fallback until a real NTCA record tags it)">
              <select
                value={cluster}
                onChange={(e) => setCluster(e.target.value as FundCluster | "")}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Unclassified</option>
                {FUND_CLUSTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          )}
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
// Main page — one live-computed quarterly report per fund cluster tab
// ─────────────────────────────────────────────────────────────────────────
const NtcaBalancePage = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [fundCluster, setFundCluster] = useState<NtcaBalanceFundCluster>("mds_regular");
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<NtcaBalanceReport | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [saroList, setSaroList] = useState<ReceivedSARO[]>([]);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<NtcaBalanceCategoryReport | null>(null);
  const [saroFormOpen, setSaroFormOpen] = useState(false);
  const [saroFormCategoryId, setSaroFormCategoryId] = useState<number | null>(null);
  const [saroFormCategoryName, setSaroFormCategoryName] = useState<string | undefined>(undefined);
  const [editingSaro, setEditingSaro] = useState<NtcaBalanceSaroReport | null>(null);

  // ── Search + PAP/SARO filters — client-side, over whatever the current
  // Year/Fund Cluster tab already loaded (mirrors the Dashboard's PAP/SARO
  // filters; Year and Cluster already have their own controls above). ──
  const [searchQuery, setSearchQuery] = useState("");
  const [papFilter, setPapFilter] = useState("");
  const [saroFilter, setSaroFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setReport(await ntcaBalanceApi.report(year, fundCluster));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, fundCluster]);

  useEffect(() => { receivedSaroApi.list({}).then(setSaroList); }, []);

  const openAddCategory = () => { setEditingCategory(null); setCategoryFormOpen(true); };
  const openEditCategory = (cat: NtcaBalanceCategoryReport) => { setEditingCategory(cat); setCategoryFormOpen(true); };

  const handleDeleteCategory = async (cat: NtcaBalanceCategoryReport) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete "${cat.name}"?`,
      text: `This removes the category and all ${cat.saros.length} tagged SARO No.(s) under it. This cannot be undone.`,
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await ntcaBalanceApi.remove(cat.id);
    load();
  };

  const openAddSaro = (categoryId: number, categoryName?: string) => {
    setSaroFormCategoryId(categoryId); setSaroFormCategoryName(categoryName); setEditingSaro(null); setSaroFormOpen(true);
  };
  const openEditSaro = (categoryId: number, categoryName: string, saro: NtcaBalanceSaroReport) => {
    setSaroFormCategoryId(categoryId); setSaroFormCategoryName(categoryName); setEditingSaro(saro); setSaroFormOpen(true);
  };

  const handleDeleteSaro = async (saro: NtcaBalanceSaroReport) => {
    const result = await Swal.fire({
      icon: "warning", title: `Untag SARO ${saro.saro_no}?`,
      text: "This removes it from the category. This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await ntcaBalanceApi.removeSaro(saro.id);
    load();
  };

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (let y = currentYear + 1; y >= currentYear - 4; y--) years.add(y);
    return Array.from(years).sort((a, b) => b - a);
  }, [currentYear]);

  const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const { selected, toggle, toggleAll, clear: clearSelection, isAllSelected, isSomeSelected } = useSelection<number>();

  const papOptions = useMemo(() => {
    if (!report) return [];
    const map = new Map<string, string>();
    report.categories.forEach((cat) => cat.saros.forEach((s) => {
      if (s.pap_code) map.set(s.pap_code, s.pap || s.pap_code);
    }));
    return Array.from(map.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [report]);

  const saroOptions = useMemo(() => {
    if (!report) return [];
    const set = new Set<string>();
    report.categories.forEach((cat) => cat.saros.forEach((s) => { if (s.saro_no) set.add(s.saro_no); }));
    return Array.from(set).sort();
  }, [report]);

  const hasActiveFilter = !!searchQuery.trim() || !!papFilter || !!saroFilter;

  const clearAllFilters = () => { setSearchQuery(""); setPapFilter(""); setSaroFilter(""); };

  // Categories/rows for the currently loaded Year+Cluster report, narrowed
  // by search/PAP/SARO — a category whose own name matches the search
  // shows all of its (already PAP/SARO-filtered) rows; otherwise only rows
  // that themselves match survive. Category-level totals in the header
  // stay the server-computed whole-category figures either way — this only
  // narrows which individual SARO rows are visible for lookup, it doesn't
  // recompute a partial subtotal.
  const filteredCategories = useMemo(() => {
    if (!report) return [];
    const q = searchQuery.trim().toLowerCase();
    return report.categories
      .map((cat) => {
        const nameMatches = q !== "" && cat.name.toLowerCase().includes(q);
        const saros = cat.saros.filter((s) => {
          if (papFilter && s.pap_code !== papFilter) return false;
          if (saroFilter && s.saro_no !== saroFilter) return false;
          if (q === "" || nameMatches) return true;
          return (
            s.saro_no.toLowerCase().includes(q) ||
            s.pap.toLowerCase().includes(q) ||
            s.purpose.toLowerCase().includes(q) ||
            s.pap_code.toLowerCase().includes(q)
          );
        });
        return { ...cat, saros };
      })
      .filter((cat) => cat.saros.length > 0 || !hasActiveFilter);
  }, [report, searchQuery, papFilter, saroFilter, hasActiveFilter]);

  // Every SARO row across every category currently shown (not just expanded
  // ones) — "select all" and bulk delete act on the whole filtered table,
  // matching how the other admin list pages' select-all behaves.
  const allSaroIds = useMemo(
    () => filteredCategories.flatMap((c) => c.saros.map((s) => s.id)),
    [filteredCategories]
  );

  const handleBulkDelete = async () => {
    const count = selected.size;
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete ${count} SARO row${count === 1 ? "" : "s"}?`,
      text: "This removes them from the category grouping. This cannot be undone.",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await ntcaBalanceApi.bulkDeleteSaros([...selected]);
    clearSelection();
    load();
  };

  const handleDeleteAll = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete the entire NTCA Balance grouping?",
      html: "This permanently deletes every category and SARO row — across every tab (MDS Regular/Special/Unclassified) and every year, not just what's currently shown. The underlying NTCA/Disbursement figures themselves aren't touched. This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete all", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    const { deleted } = await ntcaBalanceApi.clearAll();
    Swal.fire({ icon: "success", title: `Deleted ${deleted} categories`, timer: 1300, showConfirmButton: false, ...swalTheme });
    clearSelection();
    load();
  };

  return (
    <AdminLayout title="NTCA Balance" subtitle="Monitoring of NTCA Balance (Per SARO), by quarter">
      <div className="flex items-center gap-3 mb-3 sm:flex-col sm:items-stretch">
        <div className="flex gap-1.5">
          {FUND_CLUSTER_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setFundCluster(t.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                fundCluster === t.value ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={papFilter}
          onChange={(e) => setPapFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 max-w-[220px]"
        >
          <option value="">All PAP / Projects</option>
          {papOptions.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
        <select
          value={saroFilter}
          onChange={(e) => setSaroFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">All SAROs</option>
          {saroOptions.map((no) => <option key={no} value={no}>{no}</option>)}
        </select>
        {hasActiveFilter && (
          <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
            Clear filters
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
        <div className="relative flex-1 max-w-xs sm:max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search SARO no., PAP, or purpose..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <div className="flex gap-2 ml-auto sm:ml-0">
          <Button variant="outline" className="text-foreground" onClick={handleDeleteAll}>
            <AlertTriangle className="w-4 h-4 mr-2" /> Delete All
          </Button>
          <Button onClick={openAddCategory}>
            <Plus className="w-4 h-4 mr-2" /> Add Category
          </Button>
        </div>
      </div>

      <BulkActionBar count={selected.size} itemLabel="SARO row" onDelete={handleBulkDelete} onClear={clearSelection} />

      {loading ? (
        <TableSkeleton rows={8} />
      ) : !report || report.categories.length === 0 ? (
        <div className="bg-card border border-border rounded-xl px-5 py-10 text-center text-sm text-muted-foreground">
          No categories with data in {FUND_CLUSTER_TABS.find((t) => t.value === fundCluster)?.label} for {year} yet.
          Click "Add Category" to create one, then tag its SARO No.(s).
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="bg-card border border-border rounded-xl px-5 py-10 text-center text-sm text-muted-foreground">
          No SARO rows match your search/filters.{" "}
          <button onClick={clearAllFilters} className="text-primary underline">Clear filters</button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[2100px]">
              <div
                className="grid gap-x-2 px-4 border-b border-border bg-muted/40 text-muted-foreground"
                style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS, gridTemplateRows: "auto auto" }}
              >
                {/* Leading columns span both header rows — one label, vertically centered */}
                <span className="flex items-center" style={{ gridRow: "1 / span 2" }}>
                  <SelectAllCheckbox
                    checked={isAllSelected(allSaroIds)}
                    indeterminate={isSomeSelected(allSaroIds)}
                    onChange={() => toggleAll(allSaroIds)}
                  />
                </span>
                <span style={{ gridRow: "1 / span 2" }} />
                <span className="flex items-center py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ gridRow: "1 / span 2" }}>PAP</span>
                <span className="flex items-center py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ gridRow: "1 / span 2" }}>Purpose</span>
                <span className="flex items-center py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ gridRow: "1 / span 2" }}>SARO No.</span>
                <span className="flex items-center py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ gridRow: "1 / span 2" }}>Actions</span>

                {/* Row 1 — group labels, each spanning its 4 quarter columns + total */}
                <span className="text-center pt-2 pb-1 border-b border-border/70 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70" style={{ gridColumn: "span 5", gridRow: "1" }}>NTCA Received</span>
                <span className="text-center pt-2 pb-1 border-b border-border/70 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70" style={{ gridColumn: "span 5", gridRow: "1" }}>Disbursements</span>
                <span className="text-center pt-2 pb-1 border-b border-border/70 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70" style={{ gridColumn: "span 5", gridRow: "1" }}>NTCA Balance</span>

                {/* Row 2 — the actual quarter/total labels under each group */}
                {QUARTER_LABELS.map((q) => <span key={`r-${q}`} className="text-right pb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ gridRow: "2" }}>{q}</span>)}
                <span className="text-right pb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ gridRow: "2" }}>Received Total</span>
                {QUARTER_LABELS.map((q) => <span key={`d-${q}`} className="text-right pb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ gridRow: "2" }}>{q}</span>)}
                <span className="text-right pb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ gridRow: "2" }}>Disb. Total</span>
                {QUARTER_LABELS.map((q) => <span key={`b-${q}`} className="text-right pb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ gridRow: "2" }}>{q}</span>)}
                <span className="text-right pb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ gridRow: "2" }}>Balance Total</span>
              </div>

              {filteredCategories.map((cat) => {
                const catSaroIds = cat.saros.map((s) => s.id);
                // While a search/PAP/SARO filter is active, every category
                // shown already only contains matching rows — force it open
                // so those rows are actually visible without an extra click,
                // rather than requiring the user to expand each match by hand.
                const isExpanded = expanded.has(cat.id) || hasActiveFilter;
                return (
                <div key={cat.id}>
                  <div
                    onClick={() => toggleExpanded(cat.id)}
                    className="grid gap-x-2 px-4 py-2.5 border-b border-border items-center hover:bg-accent/30 transition-colors cursor-pointer bg-accent/10"
                    style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
                  >
                    <span onClick={(e) => e.stopPropagation()}>
                      <SelectAllCheckbox
                        checked={isAllSelected(catSaroIds)}
                        indeterminate={isSomeSelected(catSaroIds)}
                        onChange={() => toggleAll(catSaroIds)}
                      />
                    </span>
                    <span className="text-muted-foreground">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <span className="min-w-0"><CategoryChip label={cat.name} /></span>
                    <span /><span />
                    <span className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openAddSaro(cat.id, cat.name)} className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Tag a SARO">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openEditCategory(cat)} className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit category">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteCategory(cat)} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete category">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </span>
                    {cat.received_quarters.map((v, i) => (
                      <span key={i} className="text-xs font-medium text-foreground text-right">{formatMoney(v)}</span>
                    ))}
                    <span className="text-xs font-semibold text-foreground text-right">{formatMoney(cat.received_total)}</span>
                    {cat.disbursed_quarters.map((v, i) => (
                      <span key={i} className="text-xs font-medium text-foreground text-right">{formatMoney(v)}</span>
                    ))}
                    <span className="text-xs font-semibold text-foreground text-right">{formatMoney(cat.disbursed_total)}</span>
                    {cat.balance_quarters.map((v, i) => (
                      <span key={i} className={`text-xs font-medium text-right ${Number(v) < 0 ? "text-destructive" : "text-foreground"}`}>{formatMoney(v)}</span>
                    ))}
                    <span className={`text-xs font-semibold text-right ${Number(cat.balance_total) < 0 ? "text-destructive" : "text-foreground"}`}>{formatMoney(cat.balance_total)}</span>
                  </div>

                  {isExpanded && cat.saros.map((s) => (
                    <div
                      key={s.id}
                      className="grid gap-x-2 px-4 py-2 border-b border-border items-center text-xs"
                      style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
                    >
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                      <span />
                      <span className="text-foreground truncate pl-2" title={s.pap}>{s.pap || "—"}</span>
                      <span className="text-muted-foreground truncate" title={s.purpose}>{s.purpose || "—"}</span>
                      <span className="text-muted-foreground truncate">{s.saro_no}</span>
                      <span className="flex items-center gap-0.5">
                        <button onClick={() => openEditSaro(cat.id, cat.name, s)} className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit SARO">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteSaro(s)} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Untag SARO">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </span>
                      {s.received_quarters.map((v, i) => (
                        <span key={i} className="text-foreground text-right">{formatMoney(v)}</span>
                      ))}
                      <span className="text-foreground font-medium text-right">{formatMoney(s.received_total)}</span>
                      {s.disbursed_quarters.map((v, i) => (
                        <span key={i} className="text-foreground text-right">{formatMoney(v)}</span>
                      ))}
                      <span className="text-foreground font-medium text-right">{formatMoney(s.disbursed_total)}</span>
                      {s.balance_quarters.map((v, i) => (
                        <span key={i} className={`text-right ${Number(v) < 0 ? "text-destructive" : "text-foreground"}`}>{formatMoney(v)}</span>
                      ))}
                      <span className={`font-medium text-right ${Number(s.balance_total) < 0 ? "text-destructive" : "text-foreground"}`}>{formatMoney(s.balance_total)}</span>
                    </div>
                  ))}
                </div>
                );
              })}

              <div
                className="grid gap-x-2 px-4 py-3 bg-muted/40 items-center"
                style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
              >
                <span /><span /><span className="text-sm font-bold text-foreground">Total</span><span /><span /><span />
                {report.totals.received_quarters.map((v, i) => (
                  <span key={i} className="text-xs font-bold text-foreground text-right">{formatMoney(v)}</span>
                ))}
                <span className="text-xs font-bold text-foreground text-right">{formatMoney(report.totals.received_total)}</span>
                {report.totals.disbursed_quarters.map((v, i) => (
                  <span key={i} className="text-xs font-bold text-foreground text-right">{formatMoney(v)}</span>
                ))}
                <span className="text-xs font-bold text-foreground text-right">{formatMoney(report.totals.disbursed_total)}</span>
                {report.totals.balance_quarters.map((v, i) => (
                  <span key={i} className={`text-xs font-bold text-right ${Number(v) < 0 ? "text-destructive" : "text-foreground"}`}>{formatMoney(v)}</span>
                ))}
                <span className={`text-xs font-bold text-right ${Number(report.totals.balance_total) < 0 ? "text-destructive" : "text-foreground"}`}>{formatMoney(report.totals.balance_total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <CategoryFormDialog
        open={categoryFormOpen} onOpenChange={setCategoryFormOpen} editing={editingCategory}
        nextOrder={report?.categories.length ?? 0} onSaved={load}
        onCreated={openAddSaro}
      />
      <SaroFormDialog
        open={saroFormOpen} onOpenChange={setSaroFormOpen} categoryId={saroFormCategoryId} categoryName={saroFormCategoryName}
        editing={editingSaro} saroList={saroList} fundCluster={fundCluster} onSaved={load}
      />
    </AdminLayout>
  );
};

export default NtcaBalancePage;
