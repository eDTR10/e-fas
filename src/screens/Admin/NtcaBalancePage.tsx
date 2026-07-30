import { useEffect, useMemo, useState } from "react";
import { Upload, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import { TableSkeleton } from "./Skeleton";
import { Button } from "../../components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import { SelectAllCheckbox } from "../../components/ui/select-all-checkbox";
import { BulkActionBar } from "../../components/ui/bulk-action-bar";
import { useSelection } from "../../lib/useSelection";
import { CategoryChip } from "../../components/ui/category-chip";
import {
  ntcaBalanceApi, NtcaBalanceReport, NtcaBalanceImportCategoryRow, NtcaBalanceFundCluster,
} from "../../lib/ntcaBalanceApi";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

const FUND_CLUSTER_TABS: { value: NtcaBalanceFundCluster; label: string }[] = [
  { value: "mds_regular", label: "MDS Regular" },
  { value: "mds_special", label: "MDS Special" },
  { value: "unclassified", label: "Unclassified" },
];

const QUARTER_LABELS = ["1st Qtr", "2nd Qtr", "3rd Qtr", "4th Qtr"];

// Shared by the header and every data row so columns always line up.
// Leading "24px 24px" is the select checkbox, then the expand chevron.
const GRID_TEMPLATE_COLUMNS =
  "24px 24px minmax(160px, 1.3fr) minmax(200px, 1.6fr) minmax(110px, 1fr) " +
  "repeat(4, 90px) 100px repeat(4, 90px) 100px repeat(4, 90px) 100px";

const formatMoney = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ─────────────────────────────────────────────────────────────────────────
// Bulk import dialog — paste the "NTCA Balance (Per SARO)" CSV, preview the
// category/SARO grouping it describes, then replace the whole grouping.
// ─────────────────────────────────────────────────────────────────────────
function NtcaBalanceImportDialog({
  open, onOpenChange, onImported, fundCluster, fundClusterLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  fundCluster: NtcaBalanceFundCluster;
  fundClusterLabel: string;
}) {
  const [csvText, setCsvText] = useState("");
  const [categories, setCategories] = useState<NtcaBalanceImportCategoryRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      setCsvText("");
      setCategories(null);
      setWarnings([]);
      setError(null);
      setExpanded(new Set());
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
      const result = await ntcaBalanceApi.previewImport(csvText, fundCluster);
      setCategories(result.categories);
      setWarnings(result.warnings);
    } catch {
      setError("Could not parse this CSV. Check that it includes the PAP / Purpose / SARO No. header row.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!categories) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ntcaBalanceApi.confirmImport(categories, fundCluster);
      Swal.fire({
        icon: "success",
        title: "Import complete",
        text: `Replaced the report with ${result.categories_created} categor${result.categories_created === 1 ? "y" : "ies"} and ${result.saros_created} SARO row(s), tagged to ${fundClusterLabel}.`,
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

  const toggleExpanded = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const totalSaros = categories?.reduce((s, c) => s + c.saros.length, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Bulk Import NTCA Balance Categories</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-xs rounded-lg px-3 py-2">
            Importing replaces the entire category/SARO grouping (across every tab, not just this one) — the "NTCA Received", "Disbursements", and "Balance" figures themselves are always computed live and are not affected.
            Every row will be tagged <strong>{fundClusterLabel}</strong> (the tab you opened this from) so it shows up there immediately, unless a real NTCA record already tags its SARO No. to a different cluster.
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Paste CSV content (including the header row — PAP, Purpose, PAP Code, Class Type, SARO No., ...)
            </label>
            <textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setCategories(null); }}
              rows={8}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              placeholder="PAP,PURPOSE,PAP CODE,CLASS TYPE,SARO NO., ..."
            />
          </div>

          <div>
            <Button type="button" variant="outline" className="text-foreground" onClick={handlePreview} disabled={busy}>
              {busy && !categories ? "Parsing…" : "Preview"}
            </Button>
          </div>

          {categories && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-foreground">
                Found <strong>{categories.length}</strong> categor{categories.length === 1 ? "y" : "ies"} — <strong>{totalSaros}</strong> SARO row(s) total.
              </p>
              {warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-xs rounded-lg px-3 py-2 flex flex-col gap-1">
                  {warnings.map((w, i) => <span key={i}>{w}</span>)}
                </div>
              )}
              <div className="border border-border rounded-lg overflow-hidden max-h-[45vh] overflow-y-auto">
                {categories.map((c, i) => (
                  <div key={i} className="border-b border-border last:border-0">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
                      onClick={() => toggleExpanded(i)}
                    >
                      {expanded.has(i) ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                      <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">{c.saros.length} SARO(s)</span>
                    </button>
                    {expanded.has(i) && (
                      <div className="px-3 pb-3 bg-muted/20">
                        <div className="border border-border rounded-lg overflow-hidden">
                          <div className="grid grid-cols-[1fr_110px_70px] gap-2 px-3 py-1.5 bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>PAP / Purpose</span><span>SARO No.</span><span>Class</span>
                          </div>
                          {c.saros.map((s, j) => (
                            <div key={j} className="grid grid-cols-[1fr_110px_70px] gap-2 px-3 py-1.5 border-t border-border text-xs items-center">
                              <span className="text-foreground truncate" title={s.pap}>{s.pap || "—"}</span>
                              <span className="text-foreground">{s.saro_no}</span>
                              <span className="text-foreground">{s.class_type_label || "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || !categories || categories.length === 0}>
            {busy && categories ? "Importing…" : "Confirm & Replace"}
          </Button>
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
  const [importOpen, setImportOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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

  // Every SARO row across every category currently shown (not just expanded
  // ones) — "select all" and bulk delete act on the whole filtered table,
  // matching how the other admin list pages' select-all behaves.
  const allSaroIds = useMemo(
    () => (report ? report.categories.flatMap((c) => c.saros.map((s) => s.id)) : []),
    [report]
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
      html: "This permanently deletes every category and SARO row — across every tab (MDS Regular/Special/Unclassified) and every year, not just what's currently shown. The underlying NTCA/Disbursement figures themselves aren't touched, but you'll need to re-import the category grouping from scratch. This cannot be undone.",
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
      <div className="flex items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
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
        <div className="flex gap-2 ml-auto sm:ml-0">
          <Button variant="outline" className="text-foreground" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Bulk Import Categories
          </Button>
          <Button variant="outline" className="text-foreground" onClick={handleDeleteAll}>
            <AlertTriangle className="w-4 h-4 mr-2" /> Delete All
          </Button>
        </div>
      </div>

      <BulkActionBar count={selected.size} itemLabel="SARO row" onDelete={handleBulkDelete} onClear={clearSelection} />

      {loading ? (
        <TableSkeleton rows={8} />
      ) : !report || report.categories.length === 0 ? (
        <div className="bg-card border border-border rounded-xl px-5 py-10 text-center text-sm text-muted-foreground">
          No categories with data in {FUND_CLUSTER_TABS.find((t) => t.value === fundCluster)?.label} for {year} yet.
          Use "Bulk Import Categories" to load the PAP / SARO grouping from your working spreadsheet.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[1995px]">
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

              {report.categories.map((cat) => {
                const catSaroIds = cat.saros.map((s) => s.id);
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
                      {expanded.has(cat.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <span className="min-w-0"><CategoryChip label={cat.name} /></span>
                    <span /><span />
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

                  {expanded.has(cat.id) && cat.saros.map((s) => (
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
                <span /><span /><span className="text-sm font-bold text-foreground">Total</span><span /><span /><span /><span />
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

      <NtcaBalanceImportDialog
        open={importOpen} onOpenChange={setImportOpen} onImported={load}
        fundCluster={fundCluster} fundClusterLabel={FUND_CLUSTER_TABS.find((t) => t.value === fundCluster)?.label ?? fundCluster}
      />
    </AdminLayout>
  );
};

export default NtcaBalancePage;
