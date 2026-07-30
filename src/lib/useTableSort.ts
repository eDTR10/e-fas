import { useState } from "react";

export type SortDirection = "asc" | "desc";

// Generic click-to-sort state for a hand-rolled (non-<table>) grid list.
// `getValue` maps a row + column key to the value to compare — callers pass
// whatever key names make sense for their columns.
export function useTableSort<T>(getValue: (row: T, key: string) => string | number | null | undefined) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  // asc -> desc -> unsorted, cycling per column.
  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    setSortKey(null);
  };

  const applySort = (rows: T[]): T[] => {
    if (!sortKey) return rows;
    const key = sortKey;
    const sorted = [...rows].sort((a, b) => {
      const av = getValue(a, key);
      const bv = getValue(b, key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  };

  return { sortKey, sortDir, toggleSort, applySort };
}

// Generic per-column text filters — a Record of column key -> free-text
// query, matched as case-insensitive "contains" against whatever string the
// caller extracts for that row/column.
export function matchesColumnFilters<T>(
  row: T,
  filters: Record<string, string>,
  getText: (row: T, key: string) => string
): boolean {
  return Object.entries(filters).every(([key, query]) => {
    if (!query.trim()) return true;
    return getText(row, key).toLowerCase().includes(query.trim().toLowerCase());
  });
}
