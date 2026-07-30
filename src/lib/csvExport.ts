// Generic "array of row objects -> downloaded .csv file" helper — no
// external dependency (unlike the abandoned screens/reports/reportGenerator.ts,
// which builds a formatted .xlsx via exceljs, a package this project doesn't
// actually have installed).
function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  columns: { key: keyof T; label: string; format?: (row: T) => string }[],
  rows: T[]
): void {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(c.format ? c.format(row) : (row[c.key] as unknown))).join(",")
  );
  const csvContent = [header, ...lines].join("\r\n");
  const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
