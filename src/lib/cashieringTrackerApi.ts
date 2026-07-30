import api from "../screens/Auth/authService";

const BASE = "/api/v1/saro/cashiering-tracker";

// Cashier's own "Cashiering Tracker for DVs" worksheet (AFD-FM-TRK-006) —
// tracks a DV from receipt through NTCA download to actual payment.
// Separate from Disbursement Tracker (which mirrors the "RAOD Working File
// - DV" sheet instead) — different columns, no relationship between them.
export interface CashieringTrackerEntry {
  id: number;
  row_no: string;
  date_received: string | null;
  claimant: string;
  dv_number: string;
  particulars: string;
  net_amount: string | null;
  status_of_documents: string;
  fund_cluster: string;
  status_of_ntca: string;
  date_of_ntca_download: string | null;
  mode_of_payment: string;
  date_paid: string | null;
  ada_check_no: string;
  remarks: string;
  reasons_responsible: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type CashieringTrackerPayload = Omit<CashieringTrackerEntry, "id" | "is_archived" | "created_at" | "updated_at">;

export interface CashieringTrackerImportRow {
  row_no: string;
  date_received: string | null;
  claimant: string;
  dv_number: string;
  particulars: string;
  net_amount: number | null;
  status_of_documents: string;
  fund_cluster: string;
  status_of_ntca: string;
  date_of_ntca_download: string | null;
  mode_of_payment: string;
  date_paid: string | null;
  ada_check_no: string;
  remarks: string;
  reasons_responsible: string;
  row_number: number;
  is_duplicate: boolean;
  missing_required: boolean;
  id?: number;
}

export interface CashieringTrackerImportResult {
  dry_run: boolean;
  created: number;
  rows: CashieringTrackerImportRow[];
  warnings: string[];
}

export const cashieringTrackerApi = {
  list: async (params?: { search?: string; archived?: boolean }): Promise<CashieringTrackerEntry[]> => {
    const { data } = await api.get<CashieringTrackerEntry[]>(`${BASE}/`, {
      params: {
        search: params?.search || undefined,
        archived: params?.archived ? "true" : undefined,
      },
    });
    return data;
  },

  create: async (payload: CashieringTrackerPayload): Promise<CashieringTrackerEntry> => {
    const { data } = await api.post<CashieringTrackerEntry>(`${BASE}/`, payload);
    return data;
  },

  update: async (id: number, payload: CashieringTrackerPayload): Promise<CashieringTrackerEntry> => {
    const { data } = await api.patch<CashieringTrackerEntry>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
  },

  archive: async (id: number): Promise<CashieringTrackerEntry> => {
    const { data } = await api.post<CashieringTrackerEntry>(`${BASE}/${id}/archive/`);
    return data;
  },

  unarchive: async (id: number): Promise<CashieringTrackerEntry> => {
    const { data } = await api.post<CashieringTrackerEntry>(`${BASE}/${id}/unarchive/`);
    return data;
  },

  previewImport: async (csvText: string): Promise<CashieringTrackerImportResult> => {
    const { data } = await api.post<CashieringTrackerImportResult>(`${BASE}/bulk_import/`, {
      csv_text: csvText,
      dry_run: "true",
    });
    return data;
  },

  confirmImport: async (rows: CashieringTrackerImportRow[]): Promise<CashieringTrackerImportResult> => {
    const { data } = await api.post<CashieringTrackerImportResult>(`${BASE}/bulk_import/`, {
      rows,
      dry_run: "false",
    });
    return data;
  },

  bulkDelete: async (ids: number[]): Promise<{ deleted: number }> => {
    const { data } = await api.post<{ deleted: number }>(`${BASE}/bulk_delete/`, { ids });
    return data;
  },

  bulkArchive: async (ids: number[], archived: boolean): Promise<{ updated: number }> => {
    const { data } = await api.post<{ updated: number }>(`${BASE}/bulk_archive/`, { ids, archived });
    return data;
  },

  clearAll: async (): Promise<{ deleted: number }> => {
    const { data } = await api.post<{ deleted: number }>(`${BASE}/clear_all/`);
    return data;
  },
};
