import { useCallback, useState } from "react";

export type Quarter = "all" | "1" | "2" | "3" | "4";

const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const quarterRange = (year: number, quarter: 1 | 2 | 3 | 4): [string, string] => {
  const startMonth = (quarter - 1) * 3;
  return [toISODate(new Date(year, startMonth, 1)), toISODate(new Date(year, startMonth + 3, 0))];
};

// Shared date-range filter state (Year / Quarter / From / To) — the same
// control used on the Dashboard, reused wherever a page needs the same
// filtering behavior against its own record dates.
export function useDateRangeFilter(availableYears: number[]) {
  const [year, setYearState] = useState<string>("all");
  const [quarter, setQuarterState] = useState<Quarter>("all");
  const [dateFrom, setDateFromState] = useState("");
  const [dateTo, setDateToState] = useState("");

  const applyQuarter = useCallback((q: Quarter) => {
    setQuarterState(q);
    if (q === "all") { setDateFromState(""); setDateToState(""); return; }
    const y = year !== "all" ? Number(year) : availableYears[0] || new Date().getFullYear();
    if (year === "all") setYearState(String(y));
    const [from, to] = quarterRange(y, Number(q) as 1 | 2 | 3 | 4);
    setDateFromState(from);
    setDateToState(to);
  }, [year, availableYears]);

  const setYear = useCallback((y: string) => {
    setYearState(y); setQuarterState("all"); setDateFromState(""); setDateToState("");
  }, []);

  const setDateFrom = useCallback((d: string) => { setDateFromState(d); setQuarterState("all"); }, []);
  const setDateTo = useCallback((d: string) => { setDateToState(d); setQuarterState("all"); }, []);

  const clear = useCallback(() => {
    setYearState("all"); setQuarterState("all"); setDateFromState(""); setDateToState("");
  }, []);

  const inRange = useCallback(
    (date: string) => (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo),
    [dateFrom, dateTo]
  );

  const hasActiveDateFilter = year !== "all" || quarter !== "all" || !!dateFrom || !!dateTo;

  return {
    year, quarter, dateFrom, dateTo,
    setYear, applyQuarter, setDateFrom, setDateTo,
    clear, inRange, hasActiveDateFilter,
  };
}
