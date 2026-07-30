import api from "../screens/Auth/authService";

const BASE = "/api/v1/saro/ntcas";

export type FundCluster = "mds_regular" | "mds_special" | "trust";

export const FUND_CLUSTER_OPTIONS: { value: FundCluster; label: string }[] = [
  { value: "mds_regular", label: "MDS Regular" },
  { value: "mds_special", label: "MDS Special" },
  { value: "trust", label: "Trust" },
];

export interface NTCA {
  id: number;
  particulars: string;
  purpose: string;
  pap_code: string;
  fund_source: number | null;
  class_type: number | null;
  year: number | null;
  saro_no: string;
  saro_year: number | null;
  date_of_ntca: string;
  ntca_no: string;
  amount: string;
  nca_no: string;
  remarks: string;
  fund_cluster: FundCluster | "";
  // Original amount minus whatever's already been drawn against it via the
  // Custom Disbursement ledger — read-only, computed server-side.
  remaining_balance: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type NTCAPayload = Omit<NTCA, "id" | "remaining_balance" | "is_archived" | "created_at" | "updated_at">;

export interface NTCASaroMatch {
  id: number;
  saro_no: string;
  pap_name: string;
  date_received: string;
}

export interface NTCAImportRow {
  particulars: string;
  purpose: string;
  pap_code: string;
  fund_source_name: string;
  year: number | null;
  class_code: string;
  saro_no: string;
  saro_year: number | null;
  date_of_ntca: string;
  ntca_no: string;
  amount: number;
  nca_no: string;
  remarks: string;
  fund_cluster_label: string;
  row_number: number;
  is_duplicate: boolean;
  saro_match: NTCASaroMatch | null;
  id?: number;
}

export interface NTCAImportResult {
  dry_run: boolean;
  created: number;
  linked: number;
  rows: NTCAImportRow[];
  warnings: string[];
}

export const ntcaApi = {
  list: async (params?: { search?: string; archived?: boolean; saro_no?: string; fund_cluster?: FundCluster }): Promise<NTCA[]> => {
    const { data } = await api.get<NTCA[]>(`${BASE}/`, {
      params: {
        search: params?.search || undefined,
        archived: params?.archived ? "true" : undefined,
        saro_no: params?.saro_no || undefined,
        fund_cluster: params?.fund_cluster || undefined,
      },
    });
    return data;
  },

  create: async (payload: NTCAPayload): Promise<NTCA> => {
    const { data } = await api.post<NTCA>(`${BASE}/`, payload);
    return data;
  },

  update: async (id: number, payload: NTCAPayload): Promise<NTCA> => {
    const { data } = await api.patch<NTCA>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
  },

  // Backfills fund_cluster on rows that don't have one yet — the CSV/sheet
  // importer never sets it (there's no such column in the source sheet), so
  // this is how a batch of already-imported NTCA rows gets tagged to a
  // cluster after the fact, e.g. before they'll show up in NCA Tracker.
  bulkSetFundCluster: async (ids: number[], fundCluster: FundCluster): Promise<{ updated: number }> => {
    const { data } = await api.post<{ updated: number }>(`${BASE}/bulk_set_fund_cluster/`, {
      ids, fund_cluster: fundCluster,
    });
    return data;
  },

  archive: async (id: number): Promise<NTCA> => {
    const { data } = await api.post<NTCA>(`${BASE}/${id}/archive/`);
    return data;
  },

  unarchive: async (id: number): Promise<NTCA> => {
    const { data } = await api.post<NTCA>(`${BASE}/${id}/unarchive/`);
    return data;
  },

  previewImport: async (csvText: string): Promise<NTCAImportResult> => {
    const { data } = await api.post<NTCAImportResult>(`${BASE}/bulk_import/`, {
      csv_text: csvText,
      dry_run: "true",
    });
    return data;
  },

  confirmImport: async (rows: NTCAImportRow[]): Promise<NTCAImportResult> => {
    const { data } = await api.post<NTCAImportResult>(`${BASE}/bulk_import/`, {
      rows,
      dry_run: "false",
    });
    return data;
  },

  clearAll: async (): Promise<{ deleted: number }> => {
    const { data } = await api.post<{ deleted: number }>(`${BASE}/clear_all/`);
    return data;
  },
};
