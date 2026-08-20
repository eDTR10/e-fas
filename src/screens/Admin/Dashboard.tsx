import { useEffect, useMemo, useState } from "react";
import { FileText, Landmark, PiggyBank, Link2, Link2Off, Search, Scale, Banknote, Wallet } from "lucide-react";
import AdminLayout from "./AdminLayout";
import { StatCardsSkeleton } from "./Skeleton";
import MonthlyBarChart from "../../components/charts/MonthlyBarChart";
import HorizontalBarChart from "../../components/charts/HorizontalBarChart";
import ShareBarChart from "../../components/charts/ShareBarChart";
import DonutChart from "../../components/charts/DonutChart";
import PapPerformancePanel from "../../components/admin/PapPerformancePanel";
import DateRangeFilterBar from "../../components/filters/DateRangeFilterBar";
import { useDateRangeFilter } from "../../lib/useDateRangeFilter";
import { receivedSaroApi, ReceivedSARO } from "../../lib/receivedSaroApi";
import { ntcaApi, NTCA, FundCluster, FUND_CLUSTER_OPTIONS } from "../../lib/ntcaApi";
import { ntcaDisbursementApi, NtcaDisbursement } from "../../lib/ntcaDisbursementApi";
import { disbursementApi, Disbursement } from "../../lib/disbursementApi";
import { raodApi, raodOrsKey, SARO } from "../../lib/raodApi";
import { papApi, PAP } from "../../lib/referenceDataApi";
import { useNavigate } from "react-router-dom";

const formatCompactMoney = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};

const formatMoney = (n: number): string =>
  `₱${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

const monthKey = (date: string) => date.slice(0, 7);

function monthlyTotals(rows: { date: string; amount: number }[], months: string[]): number[] {
  return months.map((m) => rows.filter((r) => monthKey(r.date) === m).reduce((s, r) => s + r.amount, 0));
}

function sumByKey(rows: { key: string; amount: number }[]): Map<string, number> {
  const totals = new Map<string, number>();
  rows.forEach((r) => totals.set(r.key, (totals.get(r.key) || 0) + r.amount));
  return totals;
}

const TOP_N_CATEGORIES = 8;

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saroList, setSaroList] = useState<ReceivedSARO[]>([]);
  const [ntcaList, setNtcaList] = useState<NTCA[]>([]);
  const [customDisbursements, setCustomDisbursements] = useState<NtcaDisbursement[]>([]);
  const [disbursementTrackerRows, setDisbursementTrackerRows] = useState<Disbursement[]>([]);
  const [raodList, setRaodList] = useState<SARO[]>([]);
  const [papList, setPapList] = useState<PAP[]>([]);

  // ── Filters ──────────────────────────────────────────────────────────
  const [papFilter, setPapFilter] = useState("");
  const [saroFilter, setSaroFilter] = useState("");
  const [clusterFilter, setClusterFilter] = useState<FundCluster | "">("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [saros, ntcas, customDisb, disbTracker, raods, paps] = await Promise.all([
          receivedSaroApi.list({}),
          ntcaApi.list({}),
          ntcaDisbursementApi.list({}),
          disbursementApi.list({}),
          raodApi.list({}),
          papApi.list(),
        ]);
        setSaroList(saros);
        setNtcaList(ntcas);
        setCustomDisbursements(customDisb);
        setDisbursementTrackerRows(disbTracker);
        setRaodList(raods);
        setPapList(paps);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    saroList.forEach((s) => years.add(Number(s.date_received.slice(0, 4))));
    ntcaList.forEach((n) => years.add(Number(n.date_of_ntca.slice(0, 4))));
    return Array.from(years).sort((a, b) => b - a);
  }, [saroList, ntcaList]);

  const papOptions = useMemo(() => {
    const map = new Map<string, string>();
    saroList.forEach((s) => { if (s.pap_code) map.set(s.pap_code, s.pap_name || s.pap_code); });
    ntcaList.forEach((n) => { if (n.pap_code && !map.has(n.pap_code)) map.set(n.pap_code, n.particulars || n.pap_code); });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [saroList, ntcaList]);

  // Disbursement Tracker rows don't carry a pap_code field — only ORS No.
  // — so resolving one to a PAP means going through the RAOD entry it's
  // tied to (RAOD carries pap_code directly). Keyed by RAOD's combined
  // "Class Type - Fund Source - ORS No." value (raodOrsKey), which is what
  // Disbursement Tracker's own ORS No. column actually matches — not RAOD's
  // bare ORS No. field alone. Built from the full, unfiltered list since a
  // RAOD entry's PAP code is a static fact, not something date/PAP
  // filtering elsewhere should affect.
  const papCodeByOrsNo = useMemo(() => {
    const map = new Map<string, string>();
    raodList.forEach((r) => {
      const key = raodOrsKey(r);
      if (key && r.pap_code) map.set(key, r.pap_code);
    });
    return map;
  }, [raodList]);

  // SARO/RAOD/Disbursement Tracker records carry a PAP Code but no
  // fund_cluster field of their own — a PAP is optionally tagged with one
  // (see PAP.fund_cluster in referenceDataApi.ts), and NTCA/Custom
  // Disbursement rows auto-inherit it from there, so this map is how the
  // Cluster filter reaches every other dataset too. A PAP left untagged
  // simply won't match any specific cluster, same as an untagged NTCA.
  const papFundClusterByCode = useMemo(() => {
    const map = new Map<string, FundCluster>();
    papList.forEach((p) => { if (p.fund_cluster) map.set(p.code, p.fund_cluster); });
    return map;
  }, [papList]);

  const {
    year, quarter, dateFrom, dateTo,
    setYear, applyQuarter, setDateFrom, setDateTo,
    clear: clearDateFilters, inRange, hasActiveDateFilter,
  } = useDateRangeFilter(availableYears);

  const clearFilters = () => {
    clearDateFilters(); setPapFilter(""); setSaroFilter(""); setClusterFilter("");
  };

  const filteredSaro = useMemo(() => saroList.filter((s) =>
    inRange(s.date_received) &&
    (!papFilter || s.pap_code === papFilter) &&
    (!saroFilter || s.saro_no === saroFilter) &&
    (!clusterFilter || papFundClusterByCode.get(s.pap_code) === clusterFilter)
  ), [saroList, inRange, papFilter, saroFilter, clusterFilter, papFundClusterByCode]);

  const filteredNtca = useMemo(() => ntcaList.filter((n) =>
    inRange(n.date_of_ntca) &&
    (!papFilter || n.pap_code === papFilter) &&
    (!saroFilter || n.saro_no === saroFilter) &&
    (!clusterFilter || n.fund_cluster === clusterFilter)
  ), [ntcaList, inRange, papFilter, saroFilter, clusterFilter]);

  const filteredCustomDisbursements = useMemo(() => customDisbursements.filter((d) =>
    inRange(d.date) &&
    // An advance disbursement (no ntca_detail yet — see NtcaDisbursement.ntca)
    // has no PAP/SARO to match against, so it drops out once either filter
    // is active rather than crashing on a null lookup. It still carries its
    // own fund_cluster though (chosen at import/add time), so the Cluster
    // filter alone doesn't drop it the way PAP/SARO do.
    (!papFilter || d.ntca_detail?.pap_code === papFilter) &&
    (!saroFilter || d.ntca_detail?.saro_no === saroFilter) &&
    (!clusterFilter || d.fund_cluster === clusterFilter)
  ), [customDisbursements, inRange, papFilter, saroFilter, clusterFilter]);

  const filteredDisbursementTracker = useMemo(() => disbursementTrackerRows.filter((d) => {
    const papCode = papCodeByOrsNo.get(d.ors_no.trim().toLowerCase());
    return (!d.date || inRange(d.date)) &&
      (!papFilter || papCode === papFilter) &&
      (!clusterFilter || (papCode !== undefined && papFundClusterByCode.get(papCode) === clusterFilter));
  }), [disbursementTrackerRows, inRange, papFilter, clusterFilter, papCodeByOrsNo, papFundClusterByCode]);

  // RAOD dates use date_of_saro (same field RaodPage.tsx filters by).
  const filteredRaod = useMemo(() => raodList.filter((r) =>
    (!r.date_of_saro || inRange(r.date_of_saro)) &&
    (!papFilter || r.pap_code === papFilter) &&
    (!saroFilter || r.saro_no === saroFilter) &&
    (!clusterFilter || papFundClusterByCode.get(r.pap_code) === clusterFilter)
  ), [raodList, inRange, papFilter, saroFilter, clusterFilter, papFundClusterByCode]);

  const totalSaroAmount = filteredSaro.reduce((s, x) => s + Number(x.amount), 0);
  const totalNtcaAmount = filteredNtca.reduce((s, x) => s + Number(x.amount), 0);
  // Sums every Cashiering (Custom Disbursement) row for the selected
  // filters, including "advance" disbursements paid out before their NCA
  // was received/logged (ntca_detail === null) — those still have a real
  // amount and belong in this total, they just have nothing to link to yet.
  const totalCustomDisbursedAmount = filteredCustomDisbursements.reduce((s, x) => s + Number(x.amount), 0);
  const advanceCustomDisbursedAmount = filteredCustomDisbursements
    .filter((x) => !x.ntca_detail)
    .reduce((s, x) => s + Number(x.amount), 0);
  // Disbursement Tracker's Net column is left blank until populated from
  // elsewhere (see models.py) — treated as 0 here until then.
  const totalTrackerNetDisbursed = filteredDisbursementTracker.reduce((s, x) => s + Number(x.net || 0), 0);
  const totalDisbursedAmount = totalCustomDisbursedAmount + totalTrackerNetDisbursed;
  const availableBalance = totalNtcaAmount - totalDisbursedAmount;

  // Gross disbursed — from RAOD's own Cash + Non-TRA disbursement fields
  // (same formula RaodPage.tsx's own "Total Disbursed" KPI uses).
  const totalGrossDisbursed = filteredRaod.reduce((s, x) => s + Number(x.cash || 0) + Number(x.non_tra || 0), 0);
  // Net disbursed — Disbursement Tracker's own Net column.
  const totalNetDisbursed = totalTrackerNetDisbursed;

  // Per-PAP/Project performance — "released" is the SARO allotment,
  // "obligated" is RAOD's own Obligated Amount against it (RAOD carries
  // pap_code directly, no indirection needed), and Utilization Rate is
  // Obligated / Released, ranked by released amount like the reference
  // layout.
  const papPerformance = useMemo(() => {
    const papNameByCode = new Map(papOptions.map((p) => [p.code, p.name]));
    const released = sumByKey(filteredSaro.filter((s) => s.pap_code).map((s) => ({ key: s.pap_code, amount: Number(s.amount) })));
    const obligated = sumByKey(filteredRaod.filter((r) => r.pap_code).map((r) => ({ key: r.pap_code, amount: Number(r.obligated_amount || 0) })));

    const allCodes = new Set([...released.keys(), ...obligated.keys()]);
    return Array.from(allCodes)
      .map((code) => {
        const releasedAmt = released.get(code) || 0;
        const obligatedAmt = obligated.get(code) || 0;
        return {
          code,
          name: papNameByCode.get(code) || code,
          released: releasedAmt,
          obligated: obligatedAmt,
          utilizationRate: releasedAmt > 0 ? (obligatedAmt / releasedAmt) * 100 : 0,
        };
      })
      .sort((a, b) => b.released - a.released);
  }, [filteredSaro, filteredRaod, papOptions]);

  const stats: {
    title: string;
    value: number;
    count: number | null;
    icon: JSX.Element;
    caption?: string;
    captionTone?: "warning";
  }[] = [
    { title: "Total SARO", value: totalSaroAmount, count: filteredSaro.length, icon: <FileText className="w-5 h-5" /> },
    { title: "Total Received NTCA (Accounting)", value: totalNtcaAmount, count: filteredNtca.length, icon: <Landmark className="w-5 h-5" /> },
    {
      title: "NTCA Disbursed (Cashiering)",
      value: totalCustomDisbursedAmount,
      count: filteredCustomDisbursements.length,
      icon: <Wallet className="w-5 h-5" />,
      caption: advanceCustomDisbursedAmount > 0 ? `incl. ${formatCompactMoney(advanceCustomDisbursedAmount)} advance (no NTCA yet)` : undefined,
      captionTone: "warning",
    },
    { title: "Total Disbursed (Gross)", value: totalGrossDisbursed, count: filteredRaod.length, icon: <Scale className="w-5 h-5" /> },
    { title: "Total Disbursed (Net)", value: totalNetDisbursed, count: filteredDisbursementTracker.length, icon: <Banknote className="w-5 h-5" /> },
    { title: "Available Balance", value: availableBalance, count: null, icon: <PiggyBank className="w-5 h-5" /> },
  ];

  const chartMonths = useMemo(() => {
    const months = new Set<string>();
    filteredSaro.forEach((s) => months.add(monthKey(s.date_received)));
    filteredNtca.forEach((n) => months.add(monthKey(n.date_of_ntca)));
    filteredCustomDisbursements.forEach((d) => months.add(monthKey(d.date)));
    filteredDisbursementTracker.forEach((d) => { if (d.date) months.add(monthKey(d.date)); });
    filteredRaod.forEach((r) => { if (r.date_of_obligation) months.add(monthKey(r.date_of_obligation)); });
    return Array.from(months).sort().slice(-12);
  }, [filteredSaro, filteredNtca, filteredCustomDisbursements, filteredDisbursementTracker, filteredRaod]);

  const saroMonthly = monthlyTotals(filteredSaro.map((s) => ({ date: s.date_received, amount: Number(s.amount) })), chartMonths);
  const ntcaMonthly = monthlyTotals(filteredNtca.map((n) => ({ date: n.date_of_ntca, amount: Number(n.amount) })), chartMonths);

  // Obligated vs Disbursed (Gross) — both sourced from RAOD, bucketed by
  // date_of_obligation (RAOD has no separate disbursement date).
  const obligatedRaodRows = filteredRaod.filter((r) => r.date_of_obligation);
  const obligatedMonthly = monthlyTotals(
    obligatedRaodRows.map((r) => ({ date: r.date_of_obligation as string, amount: Number(r.obligated_amount || 0) })),
    chartMonths
  );
  const grossDisbursedMonthly = monthlyTotals(
    obligatedRaodRows.map((r) => ({ date: r.date_of_obligation as string, amount: Number(r.cash || 0) + Number(r.non_tra || 0) })),
    chartMonths
  );

  // Search here reaches across the full (date/PAP/SARO) filtered list, not
  // just the 8 most recent — so it can surface an older matching record too,
  // still ranked by recency and capped at 8 like the unsearched view.
  const [recentSaroSearch, setRecentSaroSearch] = useState("");
  const [recentNtcaSearch, setRecentNtcaSearch] = useState("");

  const recentSaro = useMemo(() => {
    const q = recentSaroSearch.trim().toLowerCase();
    const source = q
      ? filteredSaro.filter((s) =>
        s.saro_no.toLowerCase().includes(q) ||
        (s.pap_name || "").toLowerCase().includes(q) ||
        (s.particulars || "").toLowerCase().includes(q)
      )
      : filteredSaro;
    return [...source].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  }, [filteredSaro, recentSaroSearch]);

  const recentNtca = useMemo(() => {
    const q = recentNtcaSearch.trim().toLowerCase();
    const source = q
      ? filteredNtca.filter((n) =>
        n.ntca_no.toLowerCase().includes(q) ||
        (n.saro_no || "").toLowerCase().includes(q) ||
        (n.particulars || "").toLowerCase().includes(q)
      )
      : filteredNtca;
    return [...source].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  }, [filteredNtca, recentNtcaSearch]);

  const saroNoSet = useMemo(() => new Set(saroList.map((s) => s.saro_no)), [saroList]);

  // Shared by both SARO-keyed breakdowns below — pap_name/particulars to
  // label a SARO No. with, not just the bare number.
  const saroDetailsByNo = useMemo(() => {
    const map = new Map<string, { pap_name: string; particulars: string }>();
    filteredSaro.forEach((s) => {
      if (!map.has(s.saro_no)) {
        map.set(s.saro_no, { pap_name: s.pap_name || "", particulars: s.particulars || "" });
      }
    });
    return map;
  }, [filteredSaro]);

  const labelForSaro = (key: string): string => {
    const details = saroDetailsByNo.get(key);
    return details?.pap_name ? `${key} — ${details.pap_name}` : details?.particulars ? `${key} — ${details.particulars}` : key;
  };

  // Per-SARO breakdown — how much each specific SARO No. was allotted vs
  // how much NTCA has actually landed against it, ranked by combined total
  // (not time-bucketed like the monthly charts above).
  const saroVsNtcaByCategory = useMemo(() => {
    const saroTotals = sumByKey(filteredSaro.map((s) => ({ key: s.saro_no, amount: Number(s.amount) })));
    const ntcaTotals = sumByKey(filteredNtca.filter((n) => n.saro_no).map((n) => ({ key: n.saro_no, amount: Number(n.amount) })));
    const allKeys = new Set([...saroTotals.keys(), ...ntcaTotals.keys()]);
    const ranked = Array.from(allKeys)
      .map((key) => ({ key, label: labelForSaro(key), saro: saroTotals.get(key) || 0, ntca: ntcaTotals.get(key) || 0 }))
      .sort((a, b) => (b.saro + b.ntca) - (a.saro + a.ntca));
    const top = ranked.slice(0, TOP_N_CATEGORIES);
    return {
      categories: top.map((r) => r.label),
      data: { saro: top.map((r) => r.saro), ntca: top.map((r) => r.ntca) },
      totalCount: ranked.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSaro, filteredNtca, saroDetailsByNo]);

  return (
    <AdminLayout title="Dashboard" subtitle="Welcome back, Admin 👋">
      {/* Welcome Banner */}
      <div className="rounded-2xl bg-primary/10 border border-primary/20 px-6 py-5 mb-6 flex items-center justify-between sm:flex-col sm:items-start sm:gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Good day, Admin!</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s what&apos;s happening in your system today.</p>
        </div>
        <span className="text-3xl sm:hidden">📊</span>
      </div>


      {/* Filters — one row, above everything they scope */}
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
        hasActiveFilters={hasActiveDateFilter || !!papFilter || !!saroFilter || !!clusterFilter}
      >
        <select
          value={clusterFilter}
          onChange={(e) => setClusterFilter(e.target.value as FundCluster | "")}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">All Clusters</option>
          {FUND_CLUSTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={saroFilter}
          onChange={(e) => setSaroFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">All SAROs</option>
          {saroList.map((s) => <option key={s.id} value={s.saro_no}>{s.saro_no}</option>)}
        </select>

        <select
          value={papFilter}
          onChange={(e) => setPapFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 max-w-[220px]"
        >
          <option value="">All PAP / Projects</option>
          {papOptions.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </DateRangeFilterBar>

      {/* Stat Cards */}
      {loading ? (
        <StatCardsSkeleton />
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-6 lg:grid-cols-2 sm:grid-cols-1">
          {stats.map((stat) => (
            <div
              key={stat.title}
              className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary/40 transition-colors cursor-pointer hover:bg-accent/30"
              onClick={() => {
                switch (stat.title) {
                  case "Total SARO":
                    navigate("/admin/budget/received-saro");
                    break;
                  case "Total Received NTCA (Accounting)":
                    navigate("/admin/accounting/received-ntca");
                    break;
                  case "NTCA Disbursed (Cashiering)":
                  case "Available Balance":
                    navigate("/admin/cashier/custom-disbursement");
                    break;
                  case "Total Disbursed (Gross)":
                    navigate("/admin/budget/raod");
                    break;
                  case "Total Disbursed (Net)":
                    navigate("/admin/accounting/disbursements");
                    break;
                  default:
                    break;
                }
              }}
              style={{ userSelect: "none" }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{stat.title}</p>
                <span className="p-2 rounded-lg bg-primary/10 text-primary">{stat.icon}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{formatCompactMoney(stat.value)}</p>
              {stat.caption ? (
                <p className={`text-xs font-medium ${stat.captionTone === "warning" ? "text-destructive" : "text-muted-foreground"}`}>{stat.caption}</p>
              ) : stat.count !== null && (
                <p className="text-xs font-medium text-muted-foreground">{stat.count} record{stat.count === 1 ? "" : "s"}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Composition — how much of the Total SARO allotment has an NTCA
          received against it yet, as one proportional bar rather than a pie
          (see dataviz anti-patterns: a 2-slice pie renders as one dominant
          wedge and a sliver, which is hard to actually compare). NTCA
          received is capped at the SARO total so the two segments always
          add up to exactly the SARO figure shown at top, even if total NTCA
          receipts happen to exceed it. */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-1">
          <ShareBarChart
            title="NTCA Received vs Not Received"
            subtitle="Share of Total SARO covered by an NTCA so far, for the selected filters"
            series={[
              { key: "received", label: "NTCA Received", colorIndex: 1 },
              { key: "notReceived", label: "NTCA Not Received", colorIndex: 0 },
            ]}
            data={{
              received: Math.min(totalNtcaAmount, totalSaroAmount),
              notReceived: Math.max(totalSaroAmount - totalNtcaAmount, 0),
            }}
            formatValue={formatCompactMoney}
            totalLabel="Total SARO"
            totalValue={totalSaroAmount}
          />
          <ShareBarChart
            title="NTCA Received vs NTCA Disbursed"
            subtitle="Share of Total NTCA Received already disbursed via Cashiering (including disbursements with no NTCA yet) vs what's still remaining"
            series={[
              { key: "disbursed", label: "NTCA Disbursed", colorIndex: 2 },
              { key: "remaining", label: "Remaining NTCA Balance", colorIndex: 0 },
            ]}
            data={{
              // Not capped at totalNtcaAmount, unlike the SARO bar above —
              // an advance disbursement (no NTCA yet) can push disbursed
              // past what's actually been received, and that overdraft
              // should stay visible in the labeled figure rather than being
              // silently clipped to make the two segments add up neatly.
              disbursed: totalCustomDisbursedAmount,
              remaining: Math.max(totalNtcaAmount - totalCustomDisbursedAmount, 0),
            }}
            formatValue={formatCompactMoney}
            totalLabel="Total NTCA Received"
            totalValue={totalNtcaAmount}
          />
        </div>
      )}



      {/* Charts */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-1">
          <MonthlyBarChart
            title="SARO vs NTCA"
            subtitle="Allotment received vs cash allocation released, per month"
            months={chartMonths}
            series={[{ key: "saro", label: "SARO", colorIndex: 0 }, { key: "ntca", label: "NTCA", colorIndex: 1 }]}
            data={{ saro: saroMonthly, ntca: ntcaMonthly }}
            formatValue={formatCompactMoney}
          />
          <MonthlyBarChart
            title="Obligated vs Disbursed (Gross)"
            subtitle="RAOD obligated amount vs cash & non-TRA disbursed, per month"
            months={chartMonths}
            series={[{ key: "obligated", label: "Obligated", colorIndex: 0 }, { key: "disbursed", label: "Disbursed (Gross)", colorIndex: 2 }]}
            data={{ obligated: obligatedMonthly, disbursed: grossDisbursedMonthly }}
            formatValue={formatCompactMoney}
          />
        </div>
      )}


      {/* Per-entity breakdowns — ranked by combined total, not time-bucketed */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-1">
          {/* <HorizontalBarChart
            title="SARO vs NTCA by SARO No."
            subtitle="Allotment vs cash allocation released, per specific SARO"
            categories={saroVsNtcaByCategory.categories}
            series={[{ key: "saro", label: "SARO", colorIndex: 0 }, { key: "ntca", label: "NTCA", colorIndex: 1 }]}
            data={saroVsNtcaByCategory.data}
            formatValue={formatCompactMoney}
            footerNote={saroVsNtcaByCategory.totalCount > TOP_N_CATEGORIES
              ? `Showing top ${TOP_N_CATEGORIES} of ${saroVsNtcaByCategory.totalCount} SARO(s) by combined total`
              : undefined}
          /> */}
          {/* <DonutChart
            title="SARO vs NTCA vs Disbursed"
            subtitle="Share of combined total for the selected filters"
            series={[
              { key: "saro", label: "SARO", colorIndex: 0 },
              { key: "ntca", label: "NTCA", colorIndex: 1 },
              { key: "disbursed", label: "Disbursed", colorIndex: 2 },
            ]}
            data={{ saro: totalSaroAmount, ntca: totalNtcaAmount, disbursed: totalDisbursedAmount }}
            formatValue={formatCompactMoney}
          /> */}
        </div>
      )}



      {/* Recent tables — SARO and NTCA stacked in one column, alongside the
          PAP/Project performance panel in the other */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1 max-h-[600px] lg:max-h-none">
          <PapPerformancePanel
            rows={papPerformance}
            saroList={filteredSaro}
            formatMoney={formatMoney}
            formatCompactMoney={formatCompactMoney}
            formatDate={formatDate}
          />
          <div className="flex flex-col gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Recently Added SARO</h3>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={recentSaroSearch}
                  onChange={(e) => setRecentSaroSearch(e.target.value)}
                  placeholder="Search SARO no., PAP, or particulars..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                />
              </div>
              {recentSaro.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {recentSaroSearch ? `No SARO matches "${recentSaroSearch}".` : "No SARO records for the selected filters."}
                </p>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {recentSaro.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 cursor-pointer hover:bg-accent/50 transition-colors rounded-md px-2 -mx-2"
                      onClick={() => navigate(`/admin/budget/received-saro`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.saro_no}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.pap_name || "—"} · {formatDate(s.date_received)}</p>
                      </div>
                      <span className="text-xs font-medium text-foreground shrink-0">{formatMoney(Number(s.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Recently Added NTCA</h3>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={recentNtcaSearch}
                  onChange={(e) => setRecentNtcaSearch(e.target.value)}
                  placeholder="Search NTCA no., SARO no., or particulars..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                />
              </div>
              {recentNtca.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {recentNtcaSearch ? `No NTCA matches "${recentNtcaSearch}".` : "No NTCA records for the selected filters."}
                </p>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {recentNtca.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 cursor-pointer hover:bg-accent/50 transition-colors rounded-md px-2 -mx-2"
                      onClick={() => navigate(`/admin/accounting/received-ntca`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{n.ntca_no}</p>
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          {n.saro_no ? (
                            saroNoSet.has(n.saro_no)
                              ? <Link2 className="w-3 h-3 text-green-600 dark:text-green-400 shrink-0" />
                              : <Link2Off className="w-3 h-3 shrink-0" />
                          ) : null}
                          {n.saro_no || "unlinked"} · {formatDate(n.date_of_ntca)}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-foreground shrink-0">{formatMoney(Number(n.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>


        </div>
      )}
    </AdminLayout>
  );
};

export default Dashboard;
