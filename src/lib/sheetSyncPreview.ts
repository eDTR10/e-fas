// Shared plumbing for the "Sync Sheets" preview: how each table's preview rows
// are described on screen, and how a confirmed selection is written — through
// the very same bulk-import endpoints a manual paste uses, plus `upsert` so rows
// that already exist are brought in line with the sheet (what a sync always did).
import type { SheetSyncPreview, SyncTable } from "./sheetSyncApi";
import { raodApi, RaodImportRow } from "./raodApi";
import { ntcaApi, NTCAImportRow } from "./ntcaApi";
import { disbursementApi, DisbursementImportRow } from "./disbursementApi";
import { cashieringTrackerApi, CashieringTrackerImportRow } from "./cashieringTrackerApi";
import { receivedSaroApi, BulkImportGroupPayload } from "./receivedSaroApi";

export type PreviewRow = SheetSyncPreview["rows"][number];

// Tables whose sync goes through the preview step. (Net/Acctg is an enrichment
// pass over existing rows and the Custom Disbursement ledgers already have their
// own client-side preview — both keep their existing behaviour.)
export const PREVIEW_TABLES: SyncTable[] = [
  "received_saro", "raod", "received_ntca", "disbursement_tracker", "cashiering_tracker",
];

export const supportsSyncPreview = (table: SyncTable): boolean => PREVIEW_TABLES.includes(table);

export interface RowDescription {
  title: string;
  subtitle: string;
  amount: string | number | null | undefined;
  amountLabel: string;
  // A row the importer can't save (missing amount, no usable date, ...) — shown but never selectable.
  blockedReason?: string;
}

const text = (v: unknown, fallback = "—"): string => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s || fallback;
};

export function describeRow(table: SyncTable, r: PreviewRow): RowDescription {
  const row = r as Record<string, unknown>;
  const blocked = (reason: string, cond: unknown) => (cond ? { blockedReason: reason } : {});
  switch (table) {
    case "raod":
      return {
        title: `${text(row.saro_no, "(no SARO No.)")} — ${text(row.object_description, "(no object description)")}`,
        subtitle: `PAP ${text(row.pap_code)} · ORS ${text(row.ors_no)} · row ${text(row.row_number)}`,
        amount: (row.obligated_amount ?? row.amount_of_allotment) as number | null,
        amountLabel: row.obligated_amount != null ? "Obligated" : "Allotment",
      };
    case "received_saro":
      return {
        title: `${text(row.saro_no)}${row.year ? ` (${row.year})` : ""} — ${text(row.pap_name, "(no PAP name)")}`,
        subtitle: `${text(row.line_item_count, "0")} object code line(s) · ${text(row.fund_type)}`,
        amount: row.amount as number | null,
        amountLabel: "Amount",
        ...blocked(String(row.error || ""), row.error),
      };
    case "received_ntca":
      return {
        title: `${text(row.ntca_no)} — ${text(row.particulars, "(no particulars)")}`,
        subtitle: `SARO ${text(row.saro_no, "none")} · row ${text(row.row_number)}`,
        amount: row.amount as number | null,
        amountLabel: "Amount",
      };
    case "disbursement_tracker":
      return {
        title: `${text(row.dv_number, "(no DV No.)")} — ${text(row.name_of_claimant, "(no claimant)")}`,
        subtitle: `ORS ${text(row.ors_no)} · row ${text(row.row_number)}`,
        amount: row.amount as number | null,
        amountLabel: "Amount",
        ...blocked("Missing Amount", row.missing_required),
      };
    case "cashiering_tracker":
      return {
        title: `${text(row.dv_number, "(no DV No.)")} — ${text(row.claimant, "(no claimant)")}`,
        subtitle: `${text(row.fund_cluster)} · row ${text(row.row_number)}`,
        amount: row.net_amount as number | null,
        amountLabel: "Net",
        ...blocked("Missing Net Amount", row.missing_required),
      };
    default:
      return { title: text(row.id), subtitle: "", amount: null, amountLabel: "" };
  }
}

export interface ConfirmResult {
  created: number;
  updated: number;
}

// Writes the selected preview rows through the table's normal bulk import,
// with upsert on so existing rows are refreshed from the sheet.
export async function confirmPreviewRows(table: SyncTable, rows: PreviewRow[]): Promise<ConfirmResult> {
  const pick = (r: { created?: number; updated?: number }): ConfirmResult => ({
    created: r.created ?? 0,
    updated: r.updated ?? 0,
  });
  switch (table) {
    case "raod":
      return pick(await raodApi.confirmImport(rows as unknown as RaodImportRow[], true));
    case "received_ntca":
      return pick(await ntcaApi.confirmImport(rows as unknown as NTCAImportRow[], true));
    case "disbursement_tracker":
      return pick(await disbursementApi.confirmImport(rows as unknown as DisbursementImportRow[], true));
    case "cashiering_tracker":
      return pick(await cashieringTrackerApi.confirmImport(rows as unknown as CashieringTrackerImportRow[], true));
    case "received_saro":
      return pick(await receivedSaroApi.confirmImport(rows as unknown as BulkImportGroupPayload[]));
    default:
      return { created: 0, updated: 0 };
  }
}
