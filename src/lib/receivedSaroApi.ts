import api from "../screens/Auth/authService";

const BASE = "/api/v1/saro/received-saros";

export interface ReceivedSAROLineItem {
  id?: number;
  order?: number;
  object_code: string;
  object_description: string;
  amount: string;
  nca_amount: string | null;
  nca_date: string | null;
  nta_no: string;
  balance: string | null;
}

export interface ReceivedSARO {
  id: number;
  saro_no: string;
  region: string;
  date_received: string;
  date_of_saro: string | null;
  classification: string;
  validity_notes: string;
  amount: string;
  pap_code: string;
  pap_name: string;
  class_type_label: string;
  fund_type: string;
  particulars: string;
  fund_source: number | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  line_items: ReceivedSAROLineItem[];
}

export type ReceivedSAROPayload = Omit<
  ReceivedSARO,
  "id" | "fund_source" | "is_archived" | "created_at" | "updated_at"
>;

// The bulk_import endpoint returns raw (unserialized) Decimal/date values —
// numbers and null, not the DecimalField-as-string shape the regular CRUD
// endpoints return via ReceivedSAROLineItem.
export interface BulkImportLineItem {
  object_code: string;
  object_description: string;
  amount: number;
  nca_amount: number | null;
  nca_date: string | null;
  nta_no: string;
  balance: number | null;
}

export interface BulkImportGroupResult {
  saro_no: string;
  region: string;
  date_received: string | null;
  date_of_saro: string | null;
  classification: string;
  validity_notes: string;
  amount: number;
  pap_code: string;
  pap_name: string;
  class_type_label: string;
  fund_type: string;
  particulars: string;
  line_items: BulkImportLineItem[];
  line_item_count: number;
  is_new: boolean;
  id: number | null;
  source_rows: number[];
  error?: string;
}

// What gets submitted back on confirm — same shape as ReceivedSAROPayload,
// plus the originating row numbers (kept only for the response echo).
export type BulkImportGroupPayload = ReceivedSAROPayload & { source_rows: number[] };

export interface BulkImportResult {
  dry_run: boolean;
  created: number;
  updated: number;
  line_items_written: number;
  groups: BulkImportGroupResult[];
  warnings: string[];
}

export const receivedSaroApi = {
  list: async (params?: { search?: string; archived?: boolean }): Promise<ReceivedSARO[]> => {
    const { data } = await api.get<ReceivedSARO[]>(`${BASE}/`, {
      params: {
        search: params?.search || undefined,
        archived: params?.archived ? "true" : undefined,
      },
    });
    return data;
  },

  create: async (payload: ReceivedSAROPayload): Promise<ReceivedSARO> => {
    const { data } = await api.post<ReceivedSARO>(`${BASE}/`, payload);
    return data;
  },

  update: async (id: number, payload: ReceivedSAROPayload): Promise<ReceivedSARO> => {
    const { data } = await api.patch<ReceivedSARO>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
  },

  archive: async (id: number): Promise<ReceivedSARO> => {
    const { data } = await api.post<ReceivedSARO>(`${BASE}/${id}/archive/`);
    return data;
  },

  unarchive: async (id: number): Promise<ReceivedSARO> => {
    const { data } = await api.post<ReceivedSARO>(`${BASE}/${id}/unarchive/`);
    return data;
  },

  // Parse pasted/uploaded CSV text into a preview — nothing is written yet.
  previewImport: async (csvText: string): Promise<BulkImportResult> => {
    const { data } = await api.post<BulkImportResult>(`${BASE}/bulk_import/`, {
      csv_text: csvText,
      dry_run: "true",
    });
    return data;
  },

  // Commit the (possibly user-edited) reviewed groups from the preview step.
  confirmImport: async (groups: BulkImportGroupPayload[]): Promise<BulkImportResult> => {
    const { data } = await api.post<BulkImportResult>(`${BASE}/bulk_import/`, {
      groups,
      dry_run: "false",
    });
    return data;
  },

  clearAll: async (): Promise<{ deleted: number }> => {
    const { data } = await api.post<{ deleted: number }>(`${BASE}/clear_all/`);
    return data;
  },
};
