import api from "../screens/Auth/authService";

const BASE = "/api/v1/saro/realignment";

export interface RealignmentEntry {
  id: number;
  month: string;
  fund: string;
  class_type: string;
  pap_name: string;
  saro_no: string;
  realignment_ref: string;
  account_code: string;
  account_title: string;
  transfer_to: string;
  transfer_from: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type RealignmentEntryPayload = Omit<
  RealignmentEntry,
  "id" | "is_archived" | "created_at" | "updated_at"
>;

export type RealignmentBulkAction = "archive" | "restore" | "delete";

export const realignmentApi = {
  list: async (params?: { archived?: boolean; month?: string }): Promise<RealignmentEntry[]> => {
    const { data } = await api.get<RealignmentEntry[]>(`${BASE}/`, {
      params: {
        archived: params?.archived ? "true" : undefined,
        month: params?.month || undefined,
      },
    });
    return data;
  },

  create: async (payload: RealignmentEntryPayload): Promise<RealignmentEntry> => {
    const { data } = await api.post<RealignmentEntry>(`${BASE}/`, payload);
    return data;
  },

  update: async (id: number, payload: RealignmentEntryPayload): Promise<RealignmentEntry> => {
    const { data } = await api.patch<RealignmentEntry>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
  },

  bulkAction: async (action: RealignmentBulkAction, ids: number[]): Promise<{ updated?: number; deleted?: number }> => {
    const { data } = await api.post<{ updated?: number; deleted?: number }>(`${BASE}/bulk-action/`, { action, ids });
    return data;
  },
};
