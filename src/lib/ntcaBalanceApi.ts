import api from "../screens/Auth/authService";
import { FundCluster, FUND_CLUSTER_OPTIONS } from "./ntcaApi";

export { FUND_CLUSTER_OPTIONS };

const BASE = "/api/v1/saro/ntca-balance-categories";
const SARO_BASE = "/api/v1/saro/ntca-balance-category-saros";

// "unclassified" isn't a real FUND_CLUSTER_CHOICES value — it's the report's
// own bucket for a SARO whose linked NTCA(s) have no fund_cluster tagged
// yet (or have no matching NTCA at all).
export type NtcaBalanceFundCluster = FundCluster | "unclassified";

export interface NtcaBalanceCategorySaro {
  id: number;
  saro_no: string;
  pap: string;
  purpose: string;
  pap_code: string;
  class_type_label: string;
  order: number;
  // Fallback cluster used until a real NTCA record tags this SARO No. to
  // one — see NtcaBalanceCategorySaro.default_fund_cluster in models.py.
  default_fund_cluster: FundCluster | "";
}

export interface NtcaBalanceCategory {
  id: number;
  name: string;
  order: number;
  saros: NtcaBalanceCategorySaro[];
}

export interface NtcaBalanceCategoryPayload {
  name: string;
  order: number;
  saros: (Omit<NtcaBalanceCategorySaro, "id"> & { id?: number })[];
}

// A plain rename/reorder edit — deliberately omits `saros` entirely (as
// opposed to NtcaBalanceCategoryPayload, which always carries the full
// list) so PATCHing it never touches that category's tagged SARO rows.
// See NtcaBalanceCategorySerializer.update in the backend.
export interface NtcaBalanceCategoryMetaPayload {
  name: string;
  order: number;
}

// Standalone per-row payload — create/edit one tagged SARO No. without
// resubmitting its category's whole list (see ntcaBalanceApi.createSaro/
// updateSaro/removeSaro, backed by NtcaBalanceCategorySaroViewSet).
export interface NtcaBalanceCategorySaroPayload {
  category: number;
  saro_no: string;
  pap?: string;
  purpose?: string;
  pap_code?: string;
  class_type_label?: string;
  order?: number;
  default_fund_cluster?: FundCluster | "";
}

// ── Live-computed report shape (returned by the `report` action — never stored) ──
export interface NtcaBalanceSaroReport {
  id: number;
  saro_no: string;
  pap: string;
  purpose: string;
  pap_code: string;
  class_type_label: string;
  received_quarters: [string, string, string, string];
  disbursed_quarters: [string, string, string, string];
  balance_quarters: [string, string, string, string];
  received_total: string;
  disbursed_total: string;
  balance_total: string;
}

export interface NtcaBalanceCategoryReport {
  id: number;
  name: string;
  order: number;
  received_quarters: [string, string, string, string];
  disbursed_quarters: [string, string, string, string];
  balance_quarters: [string, string, string, string];
  received_total: string;
  disbursed_total: string;
  balance_total: string;
  saros: NtcaBalanceSaroReport[];
}

export interface NtcaBalanceReport {
  year: number;
  fund_cluster: NtcaBalanceFundCluster;
  categories: NtcaBalanceCategoryReport[];
  totals: {
    received_quarters: [string, string, string, string];
    disbursed_quarters: [string, string, string, string];
    balance_quarters: [string, string, string, string];
    received_total: string;
    disbursed_total: string;
    balance_total: string;
  };
}

export const ntcaBalanceApi = {
  list: async (): Promise<NtcaBalanceCategory[]> => {
    const { data } = await api.get<NtcaBalanceCategory[]>(`${BASE}/`);
    return data;
  },

  create: async (payload: NtcaBalanceCategoryPayload): Promise<NtcaBalanceCategory> => {
    const { data } = await api.post<NtcaBalanceCategory>(`${BASE}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
  },

  // Rename/reorder a category only — never touches its tagged SARO rows
  // (see NtcaBalanceCategoryMetaPayload).
  updateMeta: async (id: number, payload: NtcaBalanceCategoryMetaPayload): Promise<NtcaBalanceCategory> => {
    const { data } = await api.patch<NtcaBalanceCategory>(`${BASE}/${id}/`, payload);
    return data;
  },

  // Standalone per-row SARO CRUD — add/edit/remove one tagged SARO No.
  // under a category without touching its siblings or losing their ids
  // (see NtcaBalanceCategorySaroViewSet / NtcaBalanceCategorySaroPayload).
  createSaro: async (payload: NtcaBalanceCategorySaroPayload): Promise<NtcaBalanceCategorySaro> => {
    const { data } = await api.post<NtcaBalanceCategorySaro>(`${SARO_BASE}/`, payload);
    return data;
  },

  updateSaro: async (id: number, payload: Partial<NtcaBalanceCategorySaroPayload>): Promise<NtcaBalanceCategorySaro> => {
    const { data } = await api.patch<NtcaBalanceCategorySaro>(`${SARO_BASE}/${id}/`, payload);
    return data;
  },

  removeSaro: async (id: number): Promise<void> => {
    await api.delete(`${SARO_BASE}/${id}/`);
  },

  // Deletes specific SARO rows (report leaf rows) by id — the parent
  // category is left in place even if this empties it out.
  bulkDeleteSaros: async (ids: number[]): Promise<{ deleted: number }> => {
    const { data } = await api.post<{ deleted: number }>(`${BASE}/bulk_delete_saros/`, { ids });
    return data;
  },

  report: async (year: number, fundCluster: NtcaBalanceFundCluster): Promise<NtcaBalanceReport> => {
    const { data } = await api.get<NtcaBalanceReport>(`${BASE}/report/`, {
      params: { year, fund_cluster: fundCluster },
    });
    return data;
  },

  clearAll: async (): Promise<{ deleted: number }> => {
    const { data } = await api.post<{ deleted: number }>(`${BASE}/clear_all/`);
    return data;
  },
};
