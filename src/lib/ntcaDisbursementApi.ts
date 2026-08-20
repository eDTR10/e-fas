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
  // Null for an "advance" disbursement — money already paid out against an
  // NCA that hasn't been received/logged as an NTCA record yet. `raw_ntca_no`
  // keeps the NCA No. text so the row still shows something meaningful (see
  // NtcaDisbursement.ntca in the backend model).
  ntca: number | null;
  ntca_detail: NTCA | null;
  raw_ntca_no: string;
  fund_cluster: FundCluster;
  date: string;
  ada_no: string;
  amount: string;
  particulars: string;
  created_at: string;
  updated_at: string;
}

// raw_ntca_no is optional here (unlike on NtcaDisbursement itself) — only
// the paste-import/advance-disbursement path ever needs to set it; a normal
// manual add/edit through DisbursementDialog always has a real `ntca` link
// and has nothing meaningful to put there.
export type NtcaDisbursementPayload =
  Omit<NtcaDisbursement, "id" | "ntca_detail" | "created_at" | "updated_at" | "raw_ntca_no"> & { raw_ntca_no?: string };

export interface NtcaDisbursementBulkRow {
  ntca: number | null;
  raw_ntca_no?: string;
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
  // Sets every fund cluster's counter back to #001 — e.g. an approved new
  // annual series. Only "sticks" if the current year has no disbursements
  // yet; otherwise the next list() call self-heals it past them again
  // (see AdaCounterViewSet.list in the backend).
  reset: async (): Promise<{ next_number: number }> => {
    const { data } = await api.post<{ next_number: number }>(`${COUNTER_BASE}/reset/`);
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
