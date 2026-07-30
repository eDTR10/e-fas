import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, AlertTriangle, Hash, Wallet, Scale, PiggyBank, ChevronDown, ChevronRight } from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import { TableSkeleton } from "./Skeleton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { QuickFillSelect } from "../../components/ui/quick-fill-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import { ntcaApi, NTCA, FundCluster, FUND_CLUSTER_OPTIONS } from "../../lib/ntcaApi";
import {
  ntcaDisbursementApi, adaCounterApi, NtcaDisbursement, AdaCounter,
} from "../../lib/ntcaDisbursementApi";
import { Badge } from "../../components/ui/badge";
import KpiStrip from "../../components/ui/kpi-strip";
import { useTableSort, matchesColumnFilters } from "../../lib/useTableSort";
import { SortFilterHeader } from "../../components/ui/sortable-header";

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


// ─────────────────────────────────────────────────────────────────────────
// Add / Edit disbursement dialog
// ─────────────────────────────────────────────────────────────────────────
function DisbursementFormDialog({
  open, onOpenChange, editing, onSaved, ntcaList, counters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: NtcaDisbursement | null;
  onSaved: () => void;
  ntcaList: NTCA[];
  counters: AdaCounter[];
}) {
  const [ntcaId, setNtcaId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [adaNo, setAdaNo] = useState("");
  const [amount, setAmount] = useState("");
  const [particulars, setParticulars] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (editing) {
        setNtcaId(editing.ntca);
        setDate(editing.date);
        setAdaNo(editing.ada_no);
        setAmount(editing.amount);
        setParticulars(editing.particulars);
      } else {
        setNtcaId(null);
        setDate("");
        setAdaNo("");
        setAmount("");
        setParticulars("");
      }
      setError(null);
    }
  }, [open, editing]);

  const selectedNtca = ntcaList.find((n) => n.id === ntcaId) || editing?.ntca_detail;
  // The NTCA being drawn down carries its own fund cluster (used only for
  // the ADA numbering series) — default to MDS Regular if it hasn't been
  // classified into one yet.
  const effectiveFundCluster: FundCluster = (selectedNtca?.fund_cluster as FundCluster) || "mds_regular";

  // Suggest the next ADA number for whichever cluster the picked NTCA
  // belongs to, but only while adding (never clobber an edited value).
  const handlePickNtca = (n: NTCA) => {
    setNtcaId(n.id);
    if (!editing) {
      const cluster = (n.fund_cluster as FundCluster) || "mds_regular";
      const next = counters.find((c) => c.fund_cluster === cluster)?.next_number ?? 1;
      setAdaNo(String(next));
    }
  };

  const handleSubmit = async () => {
    if (!ntcaId || !date || !amount.trim()) {
      setError("NTCA, Date, and Amount are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ntca: ntcaId,
        fund_cluster: effectiveFundCluster,
        date,
        ada_no: adaNo.trim(),
        amount: amount || "0",
        particulars: particulars.trim(),
      };
      if (editing) await ntcaDisbursementApi.update(editing.id, payload);
      else await ntcaDisbursementApi.create(payload);
      Swal.fire({ icon: "success", title: editing ? "Disbursement updated" : "Disbursement added", timer: 1300, showConfirmButton: false, ...swalTheme });
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
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>{editing ? `Edit Disbursement ADA #${editing.ada_no}` : "Add Disbursement"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          {field("NTCA (pick which cash allocation this draws down)", (
            <QuickFillSelect
              placeholder="Pick from the NTCA Received list…"
              items={ntcaList}
              getLabel={(n) => `${n.ntca_no} — ${n.particulars || "(no particulars)"} — remaining ${formatMoney(n.remaining_balance)}`}
              onPick={handlePickNtca}
            />
          ))}

          {selectedNtca && (
            <div className="bg-muted/40 border border-border rounded-lg px-3 py-2.5 text-sm">
              <p className="font-medium text-foreground">{selectedNtca.ntca_no} {selectedNtca.nca_no && `(NCA ${selectedNtca.nca_no})`}</p>
              <p className="text-xs text-muted-foreground">{selectedNtca.particulars || "—"}</p>
              <p className="text-xs mt-1">
                <span className="text-muted-foreground">Original: {formatMoney(selectedNtca.amount)}</span>
                {" · "}
                <span className="text-green-600 dark:text-green-400 font-medium">Remaining: {formatMoney(selectedNtca.remaining_balance)}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                ADA series: {FUND_CLUSTER_OPTIONS.find((o) => o.value === effectiveFundCluster)?.label}
                {!selectedNtca.fund_cluster && " (this NTCA has no fund cluster set yet — defaulting to MDS Regular's ADA series)"}
              </p>
            </div>
          )}
          {!selectedNtca && ntcaId === null && (
            <p className="text-xs text-muted-foreground">No NTCA selected yet.</p>
          )}

          <div className="grid grid-cols-3 gap-4 sm:grid-cols-1">
            {field("Date *", <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />)}
            {field("ADA No. (auto-suggested, editable)", <Input value={adaNo} onChange={(e) => setAdaNo(e.target.value)} />)}
            {field("Amount to Deduct *", <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />)}
          </div>
          {field("Purpose / Particulars", (
            <Input value={particulars} onChange={(e) => setParticulars(e.target.value)} placeholder="e.g. Salary of Job Order personnel, ADA #329" />
          ))}
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
// Main page
// ─────────────────────────────────────────────────────────────────────────
const CustomDisbursementPage = () => {
  const [loading, setLoading] = useState(true);
  const [ntcaList, setNtcaList] = useState<NTCA[]>([]);
  const [disbursements, setDisbursements] = useState<NtcaDisbursement[]>([]);
  const [counters, setCounters] = useState<AdaCounter[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NtcaDisbursement | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Same dataset as NTCA Received — no fund-cluster tab to pick a subset
  // first. Fund cluster only still matters internally for which ADA
  // numbering series a disbursement draws its suggested number from (see
  // DisbursementFormDialog).
  const load = async () => {
    setLoading(true);
    try {
      const [ntcas, disb, counterList] = await Promise.all([
        ntcaApi.list({}),
        ntcaDisbursementApi.list({}),
        adaCounterApi.list(),
      ]);
      setNtcaList(ntcas);
      setDisbursements(disb);
      setCounters(counterList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Flat table, one row per NCA/NTCA received — no month grouping. Each
  // row's own "Balance" is its individual remaining balance (that NCA's
  // Amount minus disbursements drawn specifically against it, computed
  // server-side — see NTCA.remaining_balance), not a running total across
  // every NCA combined.
  const disbursementsByNtca = useMemo(() => {
    const map = new Map<number, NtcaDisbursement[]>();
    disbursements.forEach((d) => {
      if (!map.has(d.ntca)) map.set(d.ntca, []);
      map.get(d.ntca)!.push(d);
    });
    return map;
  }, [disbursements]);
  const disbursedAmountByNtca = useMemo(() => {
    const map = new Map<number, number>();
    disbursementsByNtca.forEach((list, id) => map.set(id, list.reduce((s, d) => s + Number(d.amount || 0), 0)));
    return map;
  }, [disbursementsByNtca]);

  // Per-column sort + filter — default view is newest-first until a column
  // header is clicked.
  const { sortKey, sortDir, toggleSort, applySort } = useTableSort<NTCA>((row, key) => {
    switch (key) {
      case "date_of_ntca": return row.date_of_ntca;
      case "nca_no": return row.nca_no || row.ntca_no;
      case "remarks": return row.remarks;
      case "amount": return Number(row.amount);
      case "disbursed": return disbursedAmountByNtca.get(row.id) || 0;
      case "remaining_balance": return Number(row.remaining_balance);
      default: return null;
    }
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const setColumnFilter = (key: string, value: string) => setColumnFilters((prev) => ({ ...prev, [key]: value }));

  const columnFilteredNtca = useMemo(
    () => ntcaList.filter((row) => matchesColumnFilters(row, columnFilters, (r, key) => {
      switch (key) {
        case "date_of_ntca": return formatDate(r.date_of_ntca);
        case "nca_no": return `${r.nca_no} ${r.ntca_no}`;
        case "remarks": return r.remarks;
        case "amount": return formatMoney(r.amount);
        case "disbursed": return formatMoney(disbursedAmountByNtca.get(r.id) || 0);
        case "remaining_balance": return formatMoney(r.remaining_balance);
        default: return "";
      }
    })),
    [ntcaList, columnFilters, disbursedAmountByNtca]
  );
  const dateSortedNtca = useMemo(
    () => [...columnFilteredNtca].sort((a, b) => b.date_of_ntca.localeCompare(a.date_of_ntca)),
    [columnFilteredNtca]
  );
  const sortedNtca = useMemo(() => applySort(dateSortedNtca), [dateSortedNtca, sortKey, sortDir]);

  const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // KPIs — all sourced from NTCA Received (ntcaList) and the ADA
  // disbursements drawn against it.
  const totalNcaCount = useMemo(
    () => new Set(ntcaList.filter((n) => n.nca_no?.trim()).map((n) => n.nca_no.trim())).size,
    [ntcaList]
  );
  const totalNcaAmount = ntcaList.reduce((s, n) => s + Number(n.amount || 0), 0);
  const totalNcaDisbursed = disbursements.reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalNcaRemaining = totalNcaAmount - totalNcaDisbursed;

  const handleAdd = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (d: NtcaDisbursement) => { setEditing(d); setFormOpen(true); };

  const handleDelete = async (d: NtcaDisbursement) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete this ADA #${d.ada_no} entry?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await ntcaDisbursementApi.remove(d.id);
    load();
  };

  const handleDeleteAll = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete all NCA Tracker entries?",
      html: "This permanently deletes every NCA Tracker entry. ADA counters are not affected. This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete all", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    const { deleted } = await ntcaDisbursementApi.clearAll();
    Swal.fire({ icon: "success", title: `Deleted ${deleted} entries`, timer: 1300, showConfirmButton: false, ...swalTheme });
    load();
  };

  return (
    <AdminLayout title="NCA Tracker" subtitle="NCA cash ledger, based on NTCA Received">
      <div className="flex items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
        <div className="ml-auto sm:ml-0 flex items-center gap-3">
          <Button variant="outline" className="text-foreground" onClick={handleDeleteAll} disabled={disbursements.length === 0}>
            <AlertTriangle className="w-4 h-4 mr-2" /> Delete All
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" /> Add Disbursement
          </Button>
        </div>
      </div>

      {!loading && (
        <KpiStrip cards={[
          { title: "Total NCA (Count)", value: String(totalNcaCount), icon: Hash },
          { title: "Total NCA Amount", value: formatMoney(totalNcaAmount), icon: Wallet },
          { title: "Total NCA Disbursed", value: formatMoney(totalNcaDisbursed), icon: Scale },
          { title: "Total NCA Remaining", value: formatMoney(totalNcaRemaining), icon: PiggyBank },
        ]} />
      )}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : sortedNtca.length === 0 ? (
        <div className="bg-card border border-border rounded-xl px-5 py-10 text-center text-sm text-muted-foreground">
          No NTCA received yet. Add entries on the NTCA Received page to start the ledger.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[24px_90px_150px_1fr_120px_120px_120px] gap-3 px-5 py-3 border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span />
            <SortFilterHeader label="Date" sortKey="date_of_ntca" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.date_of_ntca || ""} onFilterChange={(v) => setColumnFilter("date_of_ntca", v)} filterPlaceholder="Filter…" />
            <SortFilterHeader label="NCA No." sortKey="nca_no" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.nca_no || ""} onFilterChange={(v) => setColumnFilter("nca_no", v)} filterPlaceholder="Filter…" />
            <SortFilterHeader label="Remarks" sortKey="remarks" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.remarks || ""} onFilterChange={(v) => setColumnFilter("remarks", v)} filterPlaceholder="Filter…" />
            <SortFilterHeader label="Total Amount" sortKey="amount" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.amount || ""} onFilterChange={(v) => setColumnFilter("amount", v)} filterPlaceholder="Filter…" />
            <SortFilterHeader label="Disbursed" sortKey="disbursed" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.disbursed || ""} onFilterChange={(v) => setColumnFilter("disbursed", v)} filterPlaceholder="Filter…" />
            <SortFilterHeader label="Balance" sortKey="remaining_balance" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
              filterValue={columnFilters.remaining_balance || ""} onFilterChange={(v) => setColumnFilter("remaining_balance", v)} filterPlaceholder="Filter…" />
          </div>

          {sortedNtca.map((n) => {
            const rowDisbursements = disbursementsByNtca.get(n.id) || [];
            const disbursedForNca = rowDisbursements.reduce((s, d) => s + Number(d.amount || 0), 0);
            return (
              <div key={n.id}>
                <div
                  onClick={() => toggleExpanded(n.id)}
                  className="grid grid-cols-[24px_90px_150px_1fr_120px_120px_120px] gap-3 px-5 py-3 border-b border-border last:border-0 items-center text-sm hover:bg-accent/40 transition-colors cursor-pointer"
                >
                  <span className="text-muted-foreground">
                    {expanded.has(n.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                  <span className="text-foreground">{formatDate(n.date_of_ntca)}</span>
                  <div className="min-w-0">
                    <p className="text-foreground font-medium truncate">{n.nca_no || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{n.ntca_no}</p>
                  </div>
                  <span className="text-foreground truncate">{n.remarks || "—"}</span>
                  <span className="text-foreground">{formatMoney(n.amount)}</span>
                  <span className="text-foreground">{formatMoney(disbursedForNca)}</span>
                  <span className="font-semibold text-foreground">{formatMoney(n.remaining_balance)}</span>
                </div>

                {expanded.has(n.id) && (
                  <div className="px-5 pb-3 pt-1 bg-muted/20 border-b border-border">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">Disbursements <Badge variant="warning">out</Badge></p>
                    {rowDisbursements.length === 0 ? (
                      <p className="text-xs text-muted-foreground mb-2">No disbursements drawn against this NCA yet.</p>
                    ) : (
                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="grid grid-cols-[90px_80px_1fr_110px_70px] gap-2 px-3 py-1.5 bg-muted/30 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <span>Date</span><span>ADA #</span><span>Particulars</span><span>Amount</span><span />
                        </div>
                        {rowDisbursements.map((d) => (
                          <div key={d.id} className="grid grid-cols-[90px_80px_1fr_110px_70px] gap-2 px-3 py-1.5 border-t border-border text-xs items-center">
                            <span className="text-foreground">{formatDate(d.date)}</span>
                            <span className="text-foreground">{d.ada_no || "—"}</span>
                            <span className="text-foreground truncate">{d.particulars || "—"}</span>
                            <span className="text-foreground">{formatMoney(d.amount)}</span>
                            <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => handleEdit(d)} className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button onClick={() => handleDelete(d)} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <DisbursementFormDialog
        open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={load}
        ntcaList={ntcaList} counters={counters}
      />
    </AdminLayout>
  );
};

export default CustomDisbursementPage;
