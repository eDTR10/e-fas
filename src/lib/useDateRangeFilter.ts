import { useCallback, useState } from "react";

export type Quarter = "all" | "1" | "2" | "3" | "4";

// Builds an ISO date string (YYYY-MM-DD) from a Date's own local
// year/month/day. Deliberately NOT d.toISOString().slice(0, 10) — that
// converts through UTC, which shifts the result by a day in any timezone
// ahead of UTC (e.g. the Philippines, UTC+8: midnight Jan 1 local is
// Dec 31 16:00 UTC, so toISOString() would silently report "Dec 31" for a
// boundary the user picked/expects as "Jan 1"). Every quarter/year range
// below was off by one day in exactly this way before this fix.
const pad2 = (n: number) => String(n).padStart(2, "0");
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const yearRange = (year: number): [string, string] => [
  toISODate(new Date(year, 0, 1)),
  toISODate(new Date(year, 11, 31)),
];

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
    if (q === "all") {
      // "All" quarters still respects an already-selected Year — it narrows
      // back out to the whole year, not to no filter at all.
      if (year !== "all") {
        const [from, to] = yearRange(Number(year));
        setDateFromState(from);
        setDateToState(to);
      } else {
        setDateFromState(""); setDateToState("");
      }
      return;
    }
    const y = year !== "all" ? Number(year) : availableYears[0] || new Date().getFullYear();
    if (year === "all") setYearState(String(y));
    const [from, to] = quarterRange(y, Number(q) as 1 | 2 | 3 | 4);
    setDateFromState(from);
    setDateToState(to);
  }, [year, availableYears]);

  // Picking a Year on its own used to only set the `year` label and clear
  // dateFrom/dateTo — since inRange() only ever checks dateFrom/dateTo, that
  // meant the Year dropdown visibly showed a selection (and "Clear filters"
  // appeared) while actually filtering nothing at all. Now it bounds the
  // range to Jan 1 - Dec 31 of that year, same as Quarter already did.
  const setYear = useCallback((y: string) => {
    setYearState(y);
    setQuarterState("all");
    if (y === "all") {
      setDateFromState(""); setDateToState("");
    } else {
      const [from, to] = yearRange(Number(y));
      setDateFromState(from);
      setDateToState(to);
    }
  }, []);

  // A manually-typed From/To no longer corresponds to whatever Year/Quarter
  // was selected (if any), so both quick-pick controls drop back to "all"
  // rather than showing a stale selection next to a custom range.
  const setDateFrom = useCallback((d: string) => { setDateFromState(d); setQuarterState("all"); setYearState("all"); }, []);
  const setDateTo = useCallback((d: string) => { setDateToState(d); setQuarterState("all"); setYearState("all"); }, []);

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
