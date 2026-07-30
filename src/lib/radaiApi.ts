import api from "../screens/Auth/authService";

const BASE = "/api/v1/saro/radai-entries";

export type RadaiMdsType = "regular" | "special";

export const RADAI_MDS_TYPE_OPTIONS: { value: RadaiMdsType; label: string }[] = [
  { value: "regular", label: "RADAI-MDS Regular" },
  { value: "special", label: "RADAI-MT Special" },
];

// RADAI — Report of Advice to Debit Account Issued. Multi-line cells
// (ors_burs_no, uacs_object_code, amount) are newline-joined text, one line
// per object-code/amount split of the same DV — same convention used
// everywhere else multi-line spreadsheet cells show up in this app.
export interface RadaiEntry {
  id: number;
  mds_type: RadaiMdsType;
  date: string;
  serial_no: string;
  dv_payroll_no: string;
  ors_burs_no: string;
  responsibility_center_code: string;
  payee: string;
  uacs_object_code: string;
  nature_of_payment: string;
  amount: string;
  period_covered: string;
  entity_name: string;
  fund_cluster: string;
  bank_name_account_no: string;
  report_no: string;
  sheet_no: string;
  prepared_by_name: string;
  prepared_by_position: string;
  certified_by_name: string;
  certified_by_position: string;
  ada_nos_from: string;
  ada_nos_to: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type RadaiEntryPayload = Omit<RadaiEntry, "id" | "period_covered" | "is_archived" | "created_at" | "updated_at">;

export const radaiApi = {
  list: async (params?: { search?: string; archived?: boolean; mds_type?: RadaiMdsType; month?: string }): Promise<RadaiEntry[]> => {
    const { data } = await api.get<RadaiEntry[]>(`${BASE}/`, {
      params: {
        search: params?.search || undefined,
        archived: params?.archived ? "true" : undefined,
        mds_type: params?.mds_type || undefined,
        month: params?.month || undefined,
      },
    });
    return data;
  },

  create: async (payload: RadaiEntryPayload): Promise<RadaiEntry> => {
    const { data } = await api.post<RadaiEntry>(`${BASE}/`, payload);
    return data;
  },

  update: async (id: number, payload: RadaiEntryPayload): Promise<RadaiEntry> => {
    const { data } = await api.patch<RadaiEntry>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
  },

  archive: async (id: number): Promise<RadaiEntry> => {
    const { data } = await api.post<RadaiEntry>(`${BASE}/${id}/archive/`);
    return data;
  },

  unarchive: async (id: number): Promise<RadaiEntry> => {
    const { data } = await api.post<RadaiEntry>(`${BASE}/${id}/unarchive/`);
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
