import api from "../screens/Auth/authService";
import { ClassType, FundSource } from "./referenceDataApi";

const BASE = "/api/v1/saro/saros";

export interface SARO {
  id: number;
  pap: string;
  pap_code: string;
  purpose: string;
  year: number | null;
  date_of_saro: string | null;
  saro_no: string;
  amount_of_allotment: string | null;
  remarks: string;
  object_description: string;
  object_code: string;
  date_of_obligation: string | null;
  fund_type_description: string;
  class_type: number | null;
  class_type_detail: ClassType | null;
  fund_source: number | null;
  fund_source_detail: FundSource | null;
  ors_no: string;
  name_of_claimant: string;
  particulars: string;
  obligated_amount: string | null;
  date: string | null;
  ada_check: string;
  cash: string | null;
  non_tra: string | null;
  balance: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

// RAOD's own working sheet carries one more column past "Balance" with no
// header of its own — "Class Type - Fund Source - ORS No." combined (e.g.
// "01-01101101-2026-01-0001"). That combined value, not RAOD's bare ORS No.
// field alone, is what other sheets/tables (e.g. the "RAOD Working File -
// DV" Disbursement Tracker import) actually match their own ORS No. against.
const RAOD_CLASS_CODE_REVERSE: Record<string, string> = { PS: "01", MOOE: "02", CO: "06" };

export function raodOrsKey(r: SARO): string | null {
  const classCode = r.class_type_detail?.code;
  const fundCode = r.fund_source_detail?.code;
  if (!classCode || !fundCode || !r.ors_no) return null;
  const numeric = RAOD_CLASS_CODE_REVERSE[classCode] || classCode;
  return `${numeric}-${fundCode}-${r.ors_no}`.trim().toLowerCase();
}

export type SAROPayload = Omit<
  SARO,
  "id" | "class_type_detail" | "fund_source_detail" | "is_archived" | "created_at" | "updated_at"
>;

export interface RaodSaroMatch {
  id: number;
  saro_no: string;
  pap_name: string;
  date_received: string;
}

export interface RaodImportRow {
  pap: string;
  pap_code: string;
  date_of_saro: string | null;
  saro_no: string;
  amount_of_allotment: number | null;
  remarks: string;
  object_description: string;
  object_code: string;
  date_of_obligation: string | null;
  fund_type_description: string;
  class_type_code: string;
  fund_source_code: string;
  ors_no: string;
  name_of_claimant: string;
  particulars: string;
  obligated_amount: number | null;
  date: string | null;
  ada_check: string;
  cash: number | null;
  non_tra: number | null;
  balance: number | null;
  row_number: number;
  is_duplicate: boolean;
  saro_match: RaodSaroMatch | null;
  id?: number;
}

export interface RaodImportResult {
  dry_run: boolean;
  created: number;
  rows: RaodImportRow[];
  warnings: string[];
}

export const raodApi = {
  list: async (params?: { search?: string; archived?: boolean }): Promise<SARO[]> => {
    const { data } = await api.get<SARO[]>(`${BASE}/`, {
      params: {
        search: params?.search || undefined,
        archived: params?.archived ? "true" : undefined,
      },
    });
    return data;
  },

  create: async (payload: SAROPayload): Promise<SARO> => {
    const { data } = await api.post<SARO>(`${BASE}/`, payload);
    return data;
  },

  update: async (id: number, payload: SAROPayload): Promise<SARO> => {
    const { data } = await api.patch<SARO>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
  },

  archive: async (id: number): Promise<SARO> => {
    const { data } = await api.post<SARO>(`${BASE}/${id}/archive/`);
    return data;
  },

  unarchive: async (id: number): Promise<SARO> => {
    const { data } = await api.post<SARO>(`${BASE}/${id}/unarchive/`);
    return data;
  },

  previewImport: async (csvText: string): Promise<RaodImportResult> => {
    const { data } = await api.post<RaodImportResult>(`${BASE}/bulk_import/`, {
      csv_text: csvText,
      dry_run: "true",
    });
    return data;
  },

  confirmImport: async (rows: RaodImportRow[]): Promise<RaodImportResult> => {
    const { data } = await api.post<RaodImportResult>(`${BASE}/bulk_import/`, {
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
