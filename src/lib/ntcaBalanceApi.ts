import api from "../screens/Auth/authService";
import { FundCluster, FUND_CLUSTER_OPTIONS } from "./ntcaApi";

export { FUND_CLUSTER_OPTIONS };

const BASE = "/api/v1/saro/ntca-balance-categories";

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

// ── Bulk import (paste CSV, preview, confirm — replaces the whole grouping) ──
export interface NtcaBalanceImportSaroRow {
  saro_no: string;
  pap: string;
  purpose: string;
  pap_code: string;
  class_type_label: string;
  order: number;
}

export interface NtcaBalanceImportCategoryRow {
  name: string;
  order: number;
  saros: NtcaBalanceImportSaroRow[];
}

export interface NtcaBalanceImportResult {
  dry_run: boolean;
  categories_created: number;
  saros_created: number;
  categories: NtcaBalanceImportCategoryRow[];
  warnings: string[];
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

  update: async (id: number, payload: NtcaBalanceCategoryPayload): Promise<NtcaBalanceCategory> => {
    const { data } = await api.patch<NtcaBalanceCategory>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
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

  // fundCluster: tags every imported SARO row with the tab the import was
  // triggered from (as a fallback classification until a real NTCA record
  // exists for it) — pass "unclassified" or omit to leave rows untagged.
  previewImport: async (csvText: string, fundCluster?: NtcaBalanceFundCluster): Promise<NtcaBalanceImportResult> => {
    const { data } = await api.post<NtcaBalanceImportResult>(`${BASE}/bulk_import/`, {
      csv_text: csvText,
      dry_run: "true",
      fund_cluster: fundCluster,
    });
    return data;
  },

  confirmImport: async (categories: NtcaBalanceImportCategoryRow[], fundCluster?: NtcaBalanceFundCluster): Promise<NtcaBalanceImportResult> => {
    const { data } = await api.post<NtcaBalanceImportResult>(`${BASE}/bulk_import/`, {
      categories,
      dry_run: "false",
      fund_cluster: fundCluster,
    });
    return data;
  },

  clearAll: async (): Promise<{ deleted: number }> => {
    const { data } = await api.post<{ deleted: number }>(`${BASE}/clear_all/`);
    return data;
  },
};
