import api from "../screens/Auth/authService";

const BASE = "/api/v1/saro/rci-entries";

export type RciMdsType = "regular" | "special" | "tf";

export const RCI_MDS_TYPE_OPTIONS: { value: RciMdsType; label: string }[] = [
  { value: "regular", label: "RCI-MDS Regular" },
  { value: "special", label: "RCI-MT Special" },
  { value: "tf", label: "RCI-TF Checks" },
];

// RCI — Report of Checks Issued. Same multi-line-cell convention as RADAI
// (ors_burs_no, uacs_object_code, amount).
export interface RciEntry {
  id: number;
  mds_type: RciMdsType;
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
  check_nos_from: string;
  check_nos_to: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type RciEntryPayload = Omit<RciEntry, "id" | "period_covered" | "is_archived" | "created_at" | "updated_at">;

export const rciApi = {
  list: async (params?: { search?: string; archived?: boolean; mds_type?: RciMdsType; month?: string }): Promise<RciEntry[]> => {
    const { data } = await api.get<RciEntry[]>(`${BASE}/`, {
      params: {
        search: params?.search || undefined,
        archived: params?.archived ? "true" : undefined,
        mds_type: params?.mds_type || undefined,
        month: params?.month || undefined,
      },
    });
    return data;
  },

  create: async (payload: RciEntryPayload): Promise<RciEntry> => {
    const { data } = await api.post<RciEntry>(`${BASE}/`, payload);
    return data;
  },

  update: async (id: number, payload: RciEntryPayload): Promise<RciEntry> => {
    const { data } = await api.patch<RciEntry>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
  },

  archive: async (id: number): Promise<RciEntry> => {
    const { data } = await api.post<RciEntry>(`${BASE}/${id}/archive/`);
    return data;
  },

  unarchive: async (id: number): Promise<RciEntry> => {
    const { data } = await api.post<RciEntry>(`${BASE}/${id}/unarchive/`);
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
