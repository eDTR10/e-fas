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

// One dedicated whole-spreadsheet source per fund cluster — every tab in it
// (e.g. "MDS-REGULAR Jan2026", "MDS-REGULAR Jan2026-Feb2026") is fetched and
// parsed by ntcaLedgerSheetSync.ts; which tab a row actually belongs to is
// decided by that row's own date, not by the tab name, so a merged-range
// tab needs no special handling — see fetchNtcaLedgerTabs below.
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

export interface NtcaLedgerTabsResult {
  label: string;
  url: string;
  tabs: NtcaLedgerSheetTab[];
}

export interface SheetSyncSource {
  id: number;
  table: SyncTable;
  table_display: string;
  label: string;
  url: string;
  order: number;
  last_synced_at: string | null;
  created_at: string;
}

export type SheetSyncSourcePayload = Omit<SheetSyncSource, "id" | "table_display" | "last_synced_at" | "created_at">;

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

export const sheetSyncApi = {
  list: async (table?: SyncTable): Promise<SheetSyncSource[]> => {
    const { data } = await api.get<SheetSyncSource[]>(`${BASE}/`, { params: { table } });
    return data;
  },

  create: async (payload: SheetSyncSourcePayload): Promise<SheetSyncSource> => {
    const { data } = await api.post<SheetSyncSource>(`${BASE}/`, payload);
    return data;
  },

  update: async (id: number, payload: SheetSyncSourcePayload): Promise<SheetSyncSource> => {
    const { data } = await api.patch<SheetSyncSource>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
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
      if (hasResponse) throw error;

      // Sync imports are idempotent, so one retry is safe if the connection
      // was dropped before the client received a response.
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      const { data } = await api.post<SheetSyncResult>(`${BASE}/sync/`, { table });
      return data;
    }
  },

  // Fetches every tab in the given fund cluster's configured spreadsheet as
  // raw CSV text — parsing (matching against NTCA records, flagging advance
  // disbursements) and the actual bulk-import both happen client-side (see
  // NtcaLedgerSheetSyncDialog), reusing the same logic a manual paste
  // already goes through instead of duplicating it in Python.
  fetchNtcaLedgerTabs: async (table: SyncTable): Promise<NtcaLedgerTabsResult> => {
    const { data } = await api.get<NtcaLedgerTabsResult>(`${BASE}/ntca_ledger_tabs/`, { params: { table } });
    return data;
  },
};
