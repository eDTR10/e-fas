import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardPaste,
  FileText,
  Landmark,
  ListPlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Wallet,
} from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import { TableSkeleton } from "./Skeleton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { QuickFillSelect } from "../../components/ui/quick-fill-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  FUND_CLUSTER_OPTIONS,
  FundCluster,
  NTCA,
  ntcaApi,
} from "../../lib/ntcaApi";
import {
  AdaCounter,
  NtcaDisbursement,
  adaCounterApi,
  ntcaDisbursementApi,
} from "../../lib/ntcaDisbursementApi";
import KpiStrip from "../../components/ui/kpi-strip";
import { NtcaLedgerPasteImportDialog } from "../../components/admin/NtcaLedgerPasteImportDialog";
import { NtcaLedgerTrackerDialog } from "../../components/admin/NtcaLedgerTrackerDialog";
import { AdaDisbursedBreakdownDialog } from "../../components/admin/AdaDisbursedBreakdownDialog";
import { CustomDisbursementSheetSetupDialog } from "../../components/admin/CustomDisbursementSheetSetupDialog";
import { NtcaLedgerSheetSyncDialog } from "../../components/admin/NtcaLedgerSheetSyncDialog";

const swalTheme = {
  background: "hsl(var(--background))",
  color: "hsl(var(--foreground))",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const CURRENT_DATE = new Date();
const CURRENT_YEAR = CURRENT_DATE.getFullYear();
const CURRENT_MONTH = CURRENT_DATE.getMonth();

const formatMoney = (value: string | number | null | undefined): string => {
  const number = Number(value || 0);
  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (value: string): string => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

const extractError = (error: unknown): string => {
  const data = (error as { response?: { data?: Record<string, unknown> } })
    ?.response?.data;
  if (!data) return "The disbursement could not be saved. Please try again.";
  return Object.entries(data)
    .map(([key, value]) =>
      `${key}: ${Array.isArray(value) ? value.join(" ") : String(value)}`)
    .join(" | ");
};

const monthBounds = (year: number, month: number) => {
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const nextDate = new Date(year, month + 1, 1);
  const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, next };
};

const defaultDateForMonth = (year: number, month: number) => {
  const today = new Date();
  if (today.getFullYear() === year && today.getMonth() === month) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  }
  return monthBounds(year, month).start;
};

const monthLastDate = (year: number, month: number) => {
  const last = new Date(year, month + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
};

type MonthlyNtcaRow = {
  ncaNo: string;
  representative: NTCA;
  tranches: NTCA[];
  opening: number;
  received: number;
  disbursed: number;
  closing: number;
};

// One NCA No. commonly spans several separate NTCA "tranches" (each its
// own receipt, with its own date/amount) that get treated as a single
// pooled balance throughout this page — not tracked per-tranche. An NTCA
// with no NCA No. on file is its own standalone group of one.
const siblingTranches = (ntca: NTCA, allNtcas: NTCA[]): NTCA[] => {
  if (!ntca.nca_no) return [ntca];
  return allNtcas.filter((n) => n.nca_no === ntca.nca_no && n.fund_cluster === ntca.fund_cluster);
};

function DisbursementDialog({
  open,
  onOpenChange,
  editing,
  selectedCluster,
  selectedYear,
  selectedMonth,
  ntcas,
  disbursements,
  counters,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: NtcaDisbursement | null;
  selectedCluster: FundCluster;
  selectedYear: number;
  selectedMonth: number;
  ntcas: NTCA[];
  disbursements: NtcaDisbursement[];
  counters: AdaCounter[];
  onSaved: () => Promise<void>;
}) {
  const [ntcaId, setNtcaId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [adaNo, setAdaNo] = useState("");
  const [amount, setAmount] = useState("");
  const [particulars, setParticulars] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setNtcaId(editing?.ntca ?? null);
    setDate(editing?.date ?? defaultDateForMonth(selectedYear, selectedMonth));
    // Pre-fill with the suggested next number, but this stays editable —
    // typing over it lets a cancelled ADA number get reassigned to a new
    // disbursement instead of always taking the next sequential one.
    setAdaNo(editing?.ada_no ?? String(Math.max(1, ...counters.map((counter) => counter.next_number))).padStart(3, "0"));
    setAmount(editing?.amount ?? "");
    setParticulars(editing?.particulars ?? "");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, selectedYear, selectedMonth]);

  // NCAs with multiple tranches (separate receipts sharing one NCA No.)
  // are treated as a single pooled balance here too — the amount checked
  // is the sum across every tranche sharing that NCA No., not just the
  // one this disbursement happens to be linked to.
  const balanceAsOf = (ntca: NTCA, targetDate: string) => {
    const siblings = siblingTranches(ntca, ntcas);
    const siblingIds = new Set(siblings.map((n) => n.id));
    // Only tranches already received by targetDate count toward the
    // pool — a later tranche can't fund an earlier disbursement just
    // because it'll eventually arrive.
    const pooled = siblings
      .filter((n) => n.date_of_ntca <= targetDate)
      .reduce((sum, n) => sum + Number(n.amount), 0);
    const used = disbursements
      .filter((entry) =>
        entry.ntca !== null && siblingIds.has(entry.ntca) &&
        entry.id !== editing?.id &&
        entry.date <= targetDate)
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    return pooled - used;
  };

  const candidates = useMemo(() => {
    const eligible = ntcas.filter((ntca) =>
      ntca.fund_cluster === selectedCluster &&
      (ntca.track_in_disbursement_ledger || ntca.id === editing?.ntca));
    const groups = new Map<string, NTCA[]>();
    for (const ntca of eligible) {
      const key = ntca.nca_no || `__id_${ntca.id}`;
      const list = groups.get(key) ?? [];
      list.push(ntca);
      groups.set(key, list);
    }
    // One entry per NCA No. — the earliest tranche stands in for the
    // whole group, since selecting it draws from the pooled balance
    // regardless of which specific tranche gets the FK.
    return [...groups.values()]
      .map((tranches) => [...tranches].sort((a, b) =>
        a.date_of_ntca.localeCompare(b.date_of_ntca) || a.id - b.id)[0])
      .filter((representative) =>
        representative.date_of_ntca <= date &&
        (balanceAsOf(representative, date) > 0 || representative.id === editing?.ntca))
      .sort((a, b) =>
        a.date_of_ntca.localeCompare(b.date_of_ntca) ||
        a.ntca_no.localeCompare(b.ntca_no));
    // balanceAsOf intentionally derives from these complete inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ntcas, disbursements, selectedCluster, date, editing?.id, editing?.ntca],
  );

  const selectedNtca =
    ntcas.find((ntca) => ntca.id === ntcaId) ?? editing?.ntca_detail;
  const available = selectedNtca ? balanceAsOf(selectedNtca, date) : 0;

  const submit = async () => {
    const numericAmount = Number(amount);
    if (!ntcaId || !date || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Choose an NTCA and enter a valid date and amount.");
      return;
    }
    if (numericAmount > available) {
      setError(`The amount exceeds the available NTCA balance of ${formatMoney(available)}.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        ntca: ntcaId,
        fund_cluster: selectedCluster,
        date,
        ada_no: adaNo.trim(),
        amount: numericAmount.toFixed(2),
        particulars: particulars.trim(),
      };
      if (editing) {
        await ntcaDisbursementApi.update(editing.id, payload);
      } else {
        await ntcaDisbursementApi.create(payload);
      }
      await onSaved();
      onOpenChange(false);
      await Swal.fire({
        icon: "success",
        title: editing ? "Disbursement updated" : "ADA generated",
        timer: 1200,
        showConfirmButton: false,
        ...swalTheme,
      });
    } catch (saveError) {
      setError(extractError(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border pr-12">
          <DialogTitle>
            {editing ? `Edit ADA #${editing.ada_no}` : `New ${FUND_CLUSTER_OPTIONS.find((item) => item.value === selectedCluster)?.label} disbursement`}
          </DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Deduct a payment from one NTCA. Its balance will automatically carry into the next month.
          </p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              Disbursement date
              <Input
                type="date"
                value={date}
                min={selectedNtca?.date_of_ntca ?? monthBounds(selectedYear, selectedMonth).start}
                max={monthLastDate(selectedYear, selectedMonth)}
                onChange={(event) => {
                  setDate(event.target.value);
                  if (selectedNtca && selectedNtca.date_of_ntca > event.target.value) {
                    setNtcaId(null);
                  }
                }}
              />
            </label>
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">ADA number</p>
              <Input
                className="mt-1.5"
                value={adaNo}
                onChange={(event) => setAdaNo(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Suggested next number — overwrite to reuse one freed up by a cancelled ADA.
              </p>
            </div>
          </div>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            NTCA to deduct from
            <QuickFillSelect
              placeholder={date ? "Select an NTCA with an available balance…" : "Choose the date first…"}
              items={candidates}
              getLabel={(ntca) =>
                `${ntca.ntca_no} — ${ntca.particulars || ntca.saro_no || "No particulars"} — ${formatMoney(balanceAsOf(ntca, date))} available`}
              onPick={(ntca) => setNtcaId(ntca.id)}
            />
          </label>

          {selectedNtca && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{selectedNtca.ntca_no}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedNtca.particulars || selectedNtca.saro_no || "No particulars"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatMoney(available)} available
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Started {formatDate(selectedNtca.date_of_ntca)}
                {selectedNtca.nca_no ? ` · NCA ${selectedNtca.nca_no}` : ""}
                {selectedNtca.saro_no ? ` · ${selectedNtca.saro_no}` : ""}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              Amount to deduct
              <Input
                type="number"
                min="0.01"
                max={available || undefined}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              Purpose / particulars
              <Input
                value={particulars}
                onChange={(event) => setParticulars(event.target.value)}
                placeholder="e.g. Salaries and wages"
              />
            </label>
          </div>

          {selectedNtca && Number(amount) > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">Balance after this ADA</span>
              <span className="font-bold text-foreground">
                {formatMoney(Math.max(0, available - Number(amount)))}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border justify-end">
          <Button
            variant="outline"
            className="text-foreground"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={saving} onClick={submit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : editing ? "Save changes" : "Generate ADA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CustomDisbursementPage = () => {
  const [loading, setLoading] = useState(true);
  const [ntcas, setNtcas] = useState<NTCA[]>([]);
  const [disbursements, setDisbursements] = useState<NtcaDisbursement[]>([]);
  const [counters, setCounters] = useState<AdaCounter[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<FundCluster>("mds_regular");
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NtcaDisbursement | null>(null);
  const [pasteImportOpen, setPasteImportOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [untracking, setUntracking] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [sheetSetupOpen, setSheetSetupOpen] = useState(false);
  const [sheetSyncOpen, setSheetSyncOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ntcaRows, disbursementRows, counterRows] = await Promise.all([
        ntcaApi.list({}),
        ntcaDisbursementApi.list({}),
        adaCounterApi.list(),
      ]);
      setNtcas(ntcaRows);
      setDisbursements(disbursementRows);
      setCounters(counterRows);
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Could not load Custom Disbursement",
        text: extractError(error),
        ...swalTheme,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const years = useMemo(() => {
    const values = new Set<number>([CURRENT_YEAR]);
    ntcas.forEach((ntca) => values.add(Number(ntca.date_of_ntca.slice(0, 4))));
    disbursements.forEach((entry) => values.add(Number(entry.date.slice(0, 4))));
    return [...values].filter(Number.isFinite).sort((a, b) => b - a);
  }, [ntcas, disbursements]);

  // Only NTCAs explicitly added to this ledger view show up in the
  // roll-forward table below — everything else in NTCA Received stays out
  // of it until someone opts it in via "Add NTCA".
  const clusterNtcas = useMemo(
    () => ntcas.filter((ntca) => ntca.fund_cluster === selectedCluster && ntca.track_in_disbursement_ledger),
    [ntcas, selectedCluster],
  );
  const untrackedClusterNtcas = useMemo(
    () => ntcas.filter((ntca) => ntca.fund_cluster === selectedCluster && !ntca.track_in_disbursement_ledger && !ntca.is_archived),
    [ntcas, selectedCluster],
  );
  // Paste import needs to match against every NTCA in the cluster, not
  // just ones already opted into the roll-forward view — creating a
  // disbursement auto-opts its NTCA in anyway (see backend), so an
  // untracked match here still ends up visible after import.
  const allClusterNtcas = useMemo(
    () => ntcas.filter((ntca) => ntca.fund_cluster === selectedCluster),
    [ntcas, selectedCluster],
  );
  // A disbursement is only "in" the ledger while its parent NCA group is
  // tracked — removing an NCA cascades to hide (and, on explicit removal,
  // delete) its child disbursements too, so the ADA register never shows
  // an entry for an NCA that isn't listed in the roll-forward table above.
  const trackedNcaKeys = useMemo(
    () => new Set(clusterNtcas.map((n) => n.nca_no || `__id_${n.id}`)),
    [clusterNtcas],
  );
  const clusterDisbursements = useMemo(
    () => disbursements.filter((entry) => {
      if (entry.fund_cluster !== selectedCluster) return false;
      // An advance disbursement (no `ntca` — see the model docstring) has no
      // NCA group to be gated by; it's always shown, flagged red, until it
      // gets linked to a real NTCA record later.
      if (entry.ntca === null) return true;
      const ntca = ntcas.find((n) => n.id === entry.ntca);
      if (!ntca) return false;
      return trackedNcaKeys.has(ntca.nca_no || `__id_${ntca.id}`);
    }),
    [disbursements, selectedCluster, ntcas, trackedNcaKeys],
  );

  const { start, next } = monthBounds(selectedYear, selectedMonth);

  const monthlyRows = useMemo<MonthlyNtcaRow[]>(() => {
    const groups = new Map<string, NTCA[]>();
    for (const ntca of clusterNtcas) {
      const key = ntca.nca_no || `__id_${ntca.id}`;
      const list = groups.get(key) ?? [];
      list.push(ntca);
      groups.set(key, list);
    }
    return [...groups.entries()]
      .map(([ncaNo, rawTranches]) => {
        const tranches = [...rawTranches].sort((a, b) =>
          a.date_of_ntca.localeCompare(b.date_of_ntca) || a.id - b.id);
        const representative = tranches[0];
        const trancheIds = new Set(tranches.map((t) => t.id));
        const groupEntries = disbursements.filter((entry) => entry.ntca !== null && trancheIds.has(entry.ntca));

        const previousDisbursements = groupEntries
          .filter((entry) => entry.date < start)
          .reduce((sum, entry) => sum + Number(entry.amount), 0);
        const receivedBeforeMonth = tranches
          .filter((t) => t.date_of_ntca < start)
          .reduce((sum, t) => sum + Number(t.amount), 0);
        const opening = receivedBeforeMonth - previousDisbursements;
        const received = tranches
          .filter((t) => t.date_of_ntca >= start && t.date_of_ntca < next)
          .reduce((sum, t) => sum + Number(t.amount), 0);
        const disbursed = groupEntries
          .filter((entry) => entry.date >= start && entry.date < next)
          .reduce((sum, entry) => sum + Number(entry.amount), 0);
        return {
          ncaNo,
          representative,
          tranches,
          opening,
          received,
          disbursed,
          closing: opening + received - disbursed,
        };
      })
      // Every tracked NCA for this fund cluster stays visible in every
      // month, even one it has zero activity in — visibility is driven
      // entirely by "Add NCA" now, not by whether this month happens to
      // fall on/after its date_of_ntca.
      .sort((a, b) =>
        a.representative.date_of_ntca.localeCompare(b.representative.date_of_ntca) ||
        a.ncaNo.localeCompare(b.ncaNo));
  }, [clusterNtcas, disbursements, start, next]);

  const monthlyDisbursements = useMemo(
    () => clusterDisbursements
      .filter((entry) => entry.date >= start && entry.date < next)
      .sort((a, b) =>
        a.date.localeCompare(b.date) ||
        a.ada_no.localeCompare(b.ada_no, undefined, { numeric: true }) ||
        a.id - b.id),
    [clusterDisbursements, start, next],
  );

  const rollForwardTotals = monthlyRows.reduce(
    (result, row) => ({
      opening: result.opening + row.opening,
      received: result.received + row.received,
      disbursed: result.disbursed + row.disbursed,
      closing: result.closing + row.closing,
    }),
    { opening: 0, received: 0, disbursed: 0, closing: 0 },
  );

  // Advance disbursements (no `ntca` yet) draw down real money that isn't
  // attributable to any NCA group, so they never appear in monthlyRows —
  // folded in here so "ADA disbursed"/"Balance forwarded" still reflect
  // every peso actually spent this month, not just what's reconciled.
  const advanceMonthlyDisbursements = useMemo(
    () => monthlyDisbursements.filter((entry) => entry.ntca === null),
    [monthlyDisbursements],
  );
  const advanceDisbursedThisMonth = advanceMonthlyDisbursements.reduce((sum, entry) => sum + Number(entry.amount), 0);

  const totals = {
    ...rollForwardTotals,
    disbursed: rollForwardTotals.disbursed + advanceDisbursedThisMonth,
    closing: rollForwardTotals.closing - advanceDisbursedThisMonth,
  };

  const monthCounts = useMemo(
    () => MONTHS.map((_, month) => {
      const bounds = monthBounds(selectedYear, month);
      return clusterDisbursements.filter(
        (entry) => entry.date >= bounds.start && entry.date < bounds.next,
      ).length;
    }),
    [clusterDisbursements, selectedYear],
  );

  const balanceAfterEntry = (entry: NtcaDisbursement) => {
    const ntca = ntcas.find((row) => row.id === entry.ntca);
    if (!ntca) return 0;
    const siblings = siblingTranches(ntca, ntcas);
    const siblingIds = new Set(siblings.map((n) => n.id));
    // Only tranches already received by this entry's date count — same
    // reasoning as balanceAsOf above.
    const pooled = siblings
      .filter((n) => n.date_of_ntca <= entry.date)
      .reduce((sum, n) => sum + Number(n.amount), 0);
    const spent = disbursements
      .filter((row) =>
        row.ntca !== null && siblingIds.has(row.ntca) &&
        (row.date < entry.date || (row.date === entry.date && row.id <= entry.id)))
      .reduce((sum, row) => sum + Number(row.amount), 0);
    return pooled - spent;
  };

  const addDisbursement = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const editDisbursement = (entry: NtcaDisbursement) => {
    setEditing(entry);
    setDialogOpen(true);
  };

  const deleteDisbursement = async (entry: NtcaDisbursement) => {
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete ADA #${entry.ada_no}?`,
      text: "The amount will be restored to its NTCA balance.",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await ntcaDisbursementApi.remove(entry.id);
    await load();
  };

  const deleteAllDisbursements = async () => {
    if (monthlyDisbursements.length === 0) return;
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete all ${monthlyDisbursements.length} ADA disbursement(s) for ${MONTHS[selectedMonth]} ${selectedYear}?`,
      text: "Every amount deducted this month is restored to its NCA's balance. This cannot be undone.",
      showCancelButton: true,
      confirmButtonText: "Delete All",
      confirmButtonColor: "#dc2626",
      ...swalTheme,
    });
    if (!result.isConfirmed) return;
    setDeletingAll(true);
    try {
      await Promise.all(monthlyDisbursements.map((entry) => ntcaDisbursementApi.remove(entry.id)));
      await load();
    } finally {
      setDeletingAll(false);
    }
  };

  const untrackNtcaGroup = async (row: MonthlyNtcaRow) => {
    const trancheIds = new Set(row.tranches.map((t) => t.id));
    const childDisbursements = disbursements.filter((entry) => entry.ntca !== null && trancheIds.has(entry.ntca));
    const result = await Swal.fire({
      icon: "warning",
      title: `Remove NCA ${row.ncaNo} from this ledger?`,
      text: childDisbursements.length > 0
        ? `This permanently deletes all ${childDisbursements.length} ADA disbursement(s) tagged to this NCA, then removes its ${row.tranches.length} tranche(s) from the roll-forward table. This cannot be undone.`
        : `Removes all ${row.tranches.length} tranche(s) making up this NCA's balance from the roll-forward table — the NTCA records are untouched.`,
      showCancelButton: true,
      confirmButtonText: "Remove",
      confirmButtonColor: "#dc2626",
      ...swalTheme,
    });
    if (!result.isConfirmed) return;
    setUntracking(row.representative.id);
    try {
      await Promise.all(childDisbursements.map((entry) => ntcaDisbursementApi.remove(entry.id)));
      await Promise.all(row.tranches.map((t) => ntcaApi.untrackInLedger(t.id)));
      await load();
    } finally {
      setUntracking(null);
    }
  };

  const clusterLabel =
    FUND_CLUSTER_OPTIONS.find((option) => option.value === selectedCluster)?.label ?? "";

  return (
    <AdminLayout
      title="Custom Disbursement"
      subtitle="Monthly NTCA deductions, ADA generation, and automatic balance forwarding"
    >
      <div className="mb-5 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Year
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <div className="ml-auto flex flex-wrap gap-2 sm:ml-0">
            {FUND_CLUSTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedCluster(option.value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  selectedCluster === option.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-12 gap-1 rounded-lg bg-muted/40 p-1 sm:grid-cols-6">
          {MONTHS.map((month, index) => (
            <button
              key={month}
              type="button"
              onClick={() => setSelectedMonth(index)}
              className={`relative rounded-md px-2 py-2 text-xs font-semibold transition-colors ${
                selectedMonth === index
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
              }`}
            >
              {month}
              {monthCounts[index] > 0 && (
                <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                  {monthCounts[index]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 flex items-center gap-3">
        <div>
          <h2 className="font-semibold text-foreground">
            {MONTHS[selectedMonth]} {selectedYear} · {clusterLabel}
          </h2>
          <p className="text-xs text-muted-foreground">
            Closing balances become the opening balances for {MONTHS[(selectedMonth + 1) % 12]}.
          </p>
        </div>
        <Button variant="outline" className="ml-auto text-foreground" onClick={() => setTrackerOpen(true)}>
          <ListPlus className="mr-2 h-4 w-4" />
          Add NCA
        </Button>
        <Button variant="outline" className="text-foreground" onClick={() => setPasteImportOpen(true)}>
          <ClipboardPaste className="mr-2 h-4 w-4" />
          Paste Import
        </Button>
        <Button variant="outline" className="text-foreground" onClick={() => setSheetSetupOpen(true)}>
          <Settings2 className="mr-2 h-4 w-4" />
          Sheet Setup
        </Button>
        <Button variant="outline" className="text-foreground" onClick={() => setSheetSyncOpen(true)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Sync Sheets
        </Button>
        <Button onClick={addDisbursement}>
          <Plus className="mr-2 h-4 w-4" />
          Add disbursement
        </Button>
      </div>

      {!loading && (
        <KpiStrip cards={[
          {
            title: "Total for the month",
            value: formatMoney(totals.opening + totals.received),
            caption: "Balance forwarded (last month) + NCA added this month",
            icon: Landmark,
          },
          {
            title: "ADA disbursed",
            value: formatMoney(totals.disbursed),
            caption: advanceDisbursedThisMonth > 0
              ? `Incl. ${formatMoney(advanceDisbursedThisMonth)} not yet in NTCA Received`
              : `${monthlyDisbursements.length} ADA entr${monthlyDisbursements.length === 1 ? "y" : "ies"}`,
            captionTone: advanceDisbursedThisMonth > 0 ? "warning" : "muted",
            icon: FileText,
            onClick: () => setBreakdownOpen(true),
          },
          {
            title: "Balance forwarded",
            value: formatMoney(totals.closing),
            caption: "Available for next month",
            icon: ArrowRight,
          },
        ]} />
      )}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">NTCA balance roll-forward</h3>
                <p className="text-xs text-muted-foreground">Every NCA added to this ledger stays listed here, in every month.</p>
              </div>
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            {monthlyRows.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No {clusterLabel} NCAs added to this ledger yet. Use "Add NCA" above.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[970px]">
                  <div className="grid grid-cols-[130px_130px_1fr_125px_125px_125px_125px_32px] gap-3 border-b border-border bg-muted/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>NCA</span>
                    <span>NTCA / SARO</span>
                    <span>Particulars</span>
                    <span className="text-right">Opening</span>
                    <span className="text-right">Received</span>
                    <span className="text-right">ADA deducted</span>
                    <span className="text-right">Closing</span>
                    <span />
                  </div>
                  {monthlyRows.map((row) => (
                    <div
                      key={row.ncaNo}
                      className="grid grid-cols-[130px_130px_1fr_125px_125px_125px_125px_32px] gap-3 border-b border-border px-5 py-3 text-sm last:border-0"
                    >
                      <div>
                        <p className="font-medium text-foreground">{row.ncaNo}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDate(row.representative.date_of_ntca)}
                          {row.tranches.length > 1 ? ` · ${row.tranches.length} tranches` : ""}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-foreground">{row.representative.ntca_no}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{row.representative.saro_no || "No SARO"}</p>
                      </div>
                      <span className="truncate text-foreground">
                        {row.tranches.map((t) => t.particulars || t.remarks).find(Boolean) || "—"}
                      </span>
                      <span className="text-right tabular-nums text-foreground">{formatMoney(row.opening)}</span>
                      <span className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(row.received)}</span>
                      <span className="text-right tabular-nums text-amber-600 dark:text-amber-400">{formatMoney(row.disbursed)}</span>
                      <span className={`text-right font-semibold tabular-nums ${row.closing < 0 ? "text-destructive" : "text-foreground"}`}>
                        {formatMoney(row.closing)}
                      </span>
                      <button
                        type="button"
                        title="Delete this NCA and its ADA disbursements from the ledger"
                        aria-label={`Delete NCA ${row.ncaNo} and its ADA disbursements`}
                        onClick={() => untrackNtcaGroup(row)}
                        disabled={untracking === row.representative.id}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">ADA disbursement register</h3>
                <p className="text-xs text-muted-foreground">One shared ADA sequence is used across Regular, Special, and Trust.</p>
              </div>
              <Button
                variant="outline"
                className="text-foreground shrink-0"
                onClick={deleteAllDisbursements}
                disabled={monthlyDisbursements.length === 0 || deletingAll}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete All
              </Button>
            </div>
            {monthlyDisbursements.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No ADA disbursements recorded for this month.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[850px]">
                  <div className="grid grid-cols-[105px_90px_145px_1fr_130px_130px_70px] gap-3 border-b border-border bg-muted/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Date</span>
                    <span>ADA No.</span>
                    <span>NTCA</span>
                    <span>Purpose / particulars</span>
                    <span className="text-right">Deduction</span>
                    <span className="text-right">NTCA balance</span>
                    <span />
                  </div>
                  {monthlyDisbursements.map((entry) => (
                    <div
                      key={entry.id}
                      className={`grid grid-cols-[105px_90px_145px_1fr_130px_130px_70px] gap-3 border-b border-border px-5 py-3 text-sm last:border-0 ${!entry.ntca_detail ? "bg-destructive/5" : ""}`}
                    >
                      <span className="text-foreground">{formatDate(entry.date)}</span>
                      <span className="font-semibold text-primary">#{entry.ada_no || "—"}</span>
                      <div className="min-w-0">
                        {entry.ntca_detail ? (
                          <>
                            <p className="truncate text-foreground">{entry.ntca_detail.ntca_no}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{entry.ntca_detail.nca_no || entry.ntca_detail.saro_no}</p>
                          </>
                        ) : (
                          <>
                            <p className="truncate font-medium text-destructive">NCA {entry.raw_ntca_no || "—"}</p>
                            <p className="truncate text-[11px] text-destructive/80">Not yet in NTCA Received</p>
                          </>
                        )}
                      </div>
                      <span className="truncate text-foreground">{entry.particulars || "—"}</span>
                      <span className="text-right font-medium tabular-nums text-amber-600 dark:text-amber-400">
                        {formatMoney(entry.amount)}
                      </span>
                      <span className="text-right font-semibold tabular-nums text-foreground">
                        {entry.ntca_detail ? formatMoney(balanceAfterEntry(entry)) : "—"}
                      </span>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          aria-label={`Edit ADA ${entry.ada_no}`}
                          onClick={() => editDisbursement(entry)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ADA ${entry.ada_no}`}
                          onClick={() => deleteDisbursement(entry)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <DisbursementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        selectedCluster={selectedCluster}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        ntcas={ntcas}
        disbursements={disbursements}
        counters={counters}
        onSaved={load}
      />
      <NtcaLedgerPasteImportDialog
        open={pasteImportOpen}
        onOpenChange={setPasteImportOpen}
        ntcas={allClusterNtcas}
        fundCluster={selectedCluster}
        existingDisbursements={disbursements}
        onImported={async (year, month) => {
          // Rows always land under their own date, never under whatever tab
          // was open — but leaving the tab where it was reads as "it went to
          // the wrong month" even when it didn't, so follow the data here.
          if (year !== undefined && month !== undefined) {
            setSelectedYear(year);
            setSelectedMonth(month);
          }
          await load();
        }}
      />
      <NtcaLedgerTrackerDialog
        open={trackerOpen}
        onOpenChange={setTrackerOpen}
        ntcas={untrackedClusterNtcas}
        onChanged={load}
        viewingMonthEnd={next}
      />
      <AdaDisbursedBreakdownDialog
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        entries={monthlyDisbursements}
        periodLabel={`${MONTHS[selectedMonth]} ${selectedYear} · ${clusterLabel}`}
      />
      <CustomDisbursementSheetSetupDialog
        open={sheetSetupOpen}
        onOpenChange={setSheetSetupOpen}
      />
      <NtcaLedgerSheetSyncDialog
        open={sheetSyncOpen}
        onOpenChange={setSheetSyncOpen}
        fundCluster={selectedCluster}
        ntcas={allClusterNtcas}
        existingDisbursements={disbursements}
        onImported={async (year, month) => {
          if (year !== undefined && month !== undefined) {
            setSelectedYear(year);
            setSelectedMonth(month);
          }
          await load();
        }}
      />
    </AdminLayout>
  );
};

export default CustomDisbursementPage;
