import api from "../screens/Auth/authService";
import { FundCluster, NTCA } from "./ntcaApi";

const DISBURSEMENT_BASE = "/api/v1/saro/ntca-disbursements";
const COUNTER_BASE = "/api/v1/saro/ada-counters";

export interface AdaCounter {
  id: number;
  fund_cluster: FundCluster;
  fund_cluster_display: string;
  next_number: number;
}

export interface NtcaDisbursement {
  id: number;
  ntca: number;
  ntca_detail: NTCA;
  fund_cluster: FundCluster;
  date: string;
  ada_no: string;
  amount: string;
  particulars: string;
  created_at: string;
  updated_at: string;
}

export type NtcaDisbursementPayload = Omit<NtcaDisbursement, "id" | "ntca_detail" | "created_at" | "updated_at">;

export interface NtcaDisbursementBulkRow {
  ntca: number;
  fund_cluster: FundCluster;
  date: string;
  ada_no: string;
  amount: number;
  particulars: string;
  row_number: number;
}

export interface NtcaDisbursementBulkRowResult {
  row_number: number;
  ok?: boolean;
  error?: string;
  id?: number;
}

export interface NtcaDisbursementBulkImportResult {
  dry_run: boolean;
  created: number;
  rows: NtcaDisbursementBulkRowResult[];
}

export const adaCounterApi = {
  list: async (): Promise<AdaCounter[]> => {
    const { data } = await api.get<AdaCounter[]>(`${COUNTER_BASE}/`);
    return data;
  },
  update: async (id: number, next_number: number): Promise<AdaCounter> => {
    const { data } = await api.patch<AdaCounter>(`${COUNTER_BASE}/${id}/`, { next_number });
    return data;
  },
};

export const ntcaDisbursementApi = {
  list: async (params?: { fund_cluster?: FundCluster; ntca?: number }): Promise<NtcaDisbursement[]> => {
    const { data } = await api.get<NtcaDisbursement[]>(`${DISBURSEMENT_BASE}/`, {
      params: { fund_cluster: params?.fund_cluster || undefined, ntca: params?.ntca || undefined },
    });
    return data;
  },
  create: async (payload: NtcaDisbursementPayload): Promise<NtcaDisbursement> => {
    const { data } = await api.post<NtcaDisbursement>(`${DISBURSEMENT_BASE}/`, payload);
    return data;
  },
  update: async (id: number, payload: NtcaDisbursementPayload): Promise<NtcaDisbursement> => {
    const { data } = await api.patch<NtcaDisbursement>(`${DISBURSEMENT_BASE}/${id}/`, payload);
    return data;
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`${DISBURSEMENT_BASE}/${id}/`);
  },
  clearAll: async (): Promise<{ deleted: number }> => {
    const { data } = await api.post<{ deleted: number }>(`${DISBURSEMENT_BASE}/clear_all/`);
    return data;
  },
  bulkImport: async (rows: NtcaDisbursementBulkRow[], dryRun: boolean): Promise<NtcaDisbursementBulkImportResult> => {
    const { data } = await api.post<NtcaDisbursementBulkImportResult>(`${DISBURSEMENT_BASE}/bulk_import/`, {
      rows,
      dry_run: dryRun ? "true" : "false",
    });
    return data;
  },
};
