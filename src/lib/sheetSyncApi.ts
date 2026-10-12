import axios from "axios";
import api from "../screens/Auth/authService";

const BASE = "/api/v1/saro/sheet-sync-sources";

// The tables that support syncing from a Google Sheet instead of
// copy-pasting its contents. Keep in sync with SheetSyncSource.TABLE_CHOICES
// in models.py.
export type SyncTable =
  | "raod"
  | "received_saro"
  | "received_ntca"
  | "disbursement_tracker"
  | "disbursement_tracker_net"
  | "cashiering_tracker"
  | "ntca_ledger_mds_regular"
  | "ntca_ledger_mds_special"
  | "ntca_ledger_trust";

export const SYNC_TABLE_OPTIONS: { value: SyncTable; label: string }[] = [
  { value: "raod", label: "RAOD" },
  { value: "received_saro", label: "Received SARO" },
  { value: "received_ntca", label: "Received NTCA" },
  { value: "disbursement_tracker", label: "Disbursement Tracker" },
  { value: "disbursement_tracker_net", label: "Disbursement Tracker — Net (Acctg)" },
  { value: "cashiering_tracker", label: "Cashiering Tracker" },
  { value: "ntca_ledger_mds_regular", label: "Custom Disbursement — MDS Regular" },
  { value: "ntca_ledger_mds_special", label: "Custom Disbursement — MDS Special" },
  { value: "ntca_ledger_trust", label: "Custom Disbursement — Trust" },
];

// A fund cluster can have more than one configured spreadsheet source, same
// as every other synced table (Received NTCA, RAOD, ...) — every tab across
// every one of them (e.g. "MDS-REGULAR Jan2026", "MDS-REGULAR Jan2026-Feb2026")
// is fetched and parsed by NtcaLedgerSheetSyncDialog; which tab a row
// actually belongs to is decided by that row's own date, not by the tab
// name or which source it came from, so a merged-range tab — or a second
// spreadsheet entirely — needs no special handling. See fetchNtcaLedgerTabs
// below.
export const NTCA_LEDGER_TABLE_BY_CLUSTER: Record<"mds_regular" | "mds_special" | "trust", SyncTable> = {
  mds_regular: "ntca_ledger_mds_regular",
  mds_special: "ntca_ledger_mds_special",
  trust: "ntca_ledger_trust",
};

export interface NtcaLedgerSheetTab {
  title: string;
  gid: string;
  csv_text: string;
}

export interface NtcaLedgerSourceResult {
  id: number;
  label: string;
  url: string;
  error: string | null;
  tab_count: number;
}

export interface NtcaLedgerTabsResult {
  sources: NtcaLedgerSourceResult[];
  tabs: NtcaLedgerSheetTab[];
}

export interface SheetSyncSource {
  id: number;
  table: SyncTable;
  table_display: string;
  label: string;
  url: string;
  order: number;
  // Only used for Received SARO sheets — stamped onto every SARO synced
  // from this sheet so the same Allotment No. in two years stays separate.
  year: number | null;
  last_synced_at: string | null;
  created_at: string;
}

export type SheetSyncSourcePayload =
  Omit<SheetSyncSource, "id" | "table_display" | "last_synced_at" | "created_at" | "year"> & { year?: number | null };

export interface SheetSyncSourceResult {
  id: number;
  label: string;
  url: string;
  error: string | null;
  row_count: number;
}

export interface SheetSyncResult {
  table: SyncTable;
  sources: SheetSyncSourceResult[];
  warnings: string[];
  result: {
    created?: number;
    updated?: number;
    line_items_written?: number;
    linked?: number;
    cluster_updated?: number;
    matched?: number;
    unmatched?: number;
  };
}

// What a sync WOULD do, row by row — nothing is written until the user confirms.
export type SyncRowStatus = "new" | "update" | "unchanged";

export interface SheetSyncPreview {
  table: SyncTable;
  dry_run: true;
  sources: SheetSyncSourceResult[];
  warnings: string[];
  // Flat rows for most tables; SARO groups (header + line items) for received_saro.
  // Each carries `sync_status`, and `changed_fields` when it is an update.
  rows: (Record<string, unknown> & { sync_status?: SyncRowStatus; changed_fields?: string[] })[];
}

export const sheetSyncApi = {
  list: async (table?: SyncTable): Promise<SheetSyncSource[]> => {
    const { data } = await api.get<SheetSyncSource[]>(`${BASE}/`, { params: { table } });
    return data;
  },

  create: async (payload: SheetSyncSourcePayload): Promise<SheetSyncSource> => {
    const { data } = await api.post<SheetSyncSource>(`${BASE}/`, payload);
    return data;
  },

  update: async (id: number, payload: Partial<SheetSyncSourcePayload>): Promise<SheetSyncSource> => {
    const { data } = await api.patch<SheetSyncSource>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
  },

  // Fetch + parse every configured sheet exactly like a sync, but write nothing.
  preview: async (table: SyncTable): Promise<SheetSyncPreview> => {
    const { data } = await api.post<SheetSyncPreview>(`${BASE}/sync/`, { table, dry_run: "true" });
    return data;
  },

  // Stamp "last synced" on the table's sources after a confirmed preview.
  markSynced: async (table: SyncTable): Promise<void> => {
    await api.post(`${BASE}/mark_synced/`, { table });
  },

  // Fetches every configured sheet for this table, merges their rows into
  // one import, and writes it immediately (no preview step) — see
  // SheetSyncSourceViewSet.sync in views.py.
  sync: async (table: SyncTable): Promise<SheetSyncResult> => {
    try {
      const { data } = await api.post<SheetSyncResult>(`${BASE}/sync/`, { table });
      return data;
    } catch (error) {
      const hasResponse = Boolean((error as { response?: unknown })?.response);
      // A user-cancelled sync must stay cancelled — it also has no response,
      // so without this it would be mistaken for a dropped connection and resent.
      if (hasResponse || axios.isCancel(error)) throw error;

      // Sync imports are idempotent, so one retry is safe if the connection
      // was dropped before the client received a response.
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      const { data } = await api.post<SheetSyncResult>(`${BASE}/sync/`, { table });
      return data;
    }
  },

  // Fetches every tab across every configured spreadsheet source for the
  // given fund cluster, merged into one list, as raw CSV text — parsing
  // (matching against NTCA records, flagging advance disbursements) and the
  // actual bulk-import both happen client-side (see NtcaLedgerSheetSyncDialog),
  // reusing the same logic a manual paste
  // already goes through instead of duplicating it in Python.
  fetchNtcaLedgerTabs: async (table: SyncTable): Promise<NtcaLedgerTabsResult> => {
    const { data } = await api.get<NtcaLedgerTabsResult>(`${BASE}/ntca_ledger_tabs/`, { params: { table } });
    return data;
  },
};
