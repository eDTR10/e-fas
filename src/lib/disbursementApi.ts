import api from "../screens/Auth/authService";

const BASE = "/api/v1/saro/disbursements";

// Mirrors the "RAOD Working File - DV" spreadsheet columns directly. Gross
// is always looked up server-side from RAOD (matching ORS No.), never taken
// from the sheet. Net, Date Paid, ADA/Check, and NCA are read from the
// sheet when present. A re-sync refreshes matching rows from the source —
// see saro/importers.py.
export interface Disbursement {
  id: number;
  routing_slip_no: string;
  dv_number: string;
  date: string | null;
  time_received: string;
  received_by_budget_officer: string;
  efficiency: string;
  remarks: string;
  fund_source: string;
  ors_no: string;
  name_of_claimant: string;
  particulars: string;
  amount: string | null;
  gross: string | null;
  net: string | null;
  date_paid: string | null;
  ada_check: string;
  nca: string | null;
  created_at: string;
  updated_at: string;
}

export type DisbursementPayload = Omit<Disbursement, "id" | "created_at" | "updated_at">;

export interface DisbursementImportRow {
  routing_slip_no: string;
  dv_number: string;
  date: string | null;
  time_received: string;
  received_by_budget_officer?: string;
  efficiency?: string;
  remarks?: string;
  fund_source: string;
  ors_no: string;
  name_of_claimant: string;
  particulars: string;
  amount: number | null;
  gross?: number | null;
  net?: number | null;
  date_paid?: string | null;
  ada_check?: string;
  nca?: number | null;
  row_number: number;
  is_duplicate: boolean;
  missing_required: boolean;
  id?: number;
}

export interface DisbursementImportResult {
  dry_run: boolean;
  created: number;
  updated: number;
  rows: DisbursementImportRow[];
  warnings: string[];
}

export const disbursementApi = {
  list: async (params?: { search?: string }): Promise<Disbursement[]> => {
    const { data } = await api.get<Disbursement[]>(`${BASE}/`, {
      params: { search: params?.search || undefined },
    });
    return data;
  },

  create: async (payload: DisbursementPayload): Promise<Disbursement> => {
    const { data } = await api.post<Disbursement>(`${BASE}/`, payload);
    return data;
  },

  update: async (id: number, payload: DisbursementPayload): Promise<Disbursement> => {
    const { data } = await api.patch<Disbursement>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
  },

  previewImport: async (csvText: string): Promise<DisbursementImportResult> => {
    const { data } = await api.post<DisbursementImportResult>(`${BASE}/bulk_import/`, {
      csv_text: csvText,
      dry_run: "true",
    });
    return data;
  },

  confirmImport: async (rows: DisbursementImportRow[]): Promise<DisbursementImportResult> => {
    const { data } = await api.post<DisbursementImportResult>(`${BASE}/bulk_import/`, {
      rows,
      dry_run: "false",
    });
    return data;
  },

  clearAll: async (): Promise<{ deleted: number }> => {
    const { data } = await api.post<{ deleted: number }>(`${BASE}/clear_all/`);
    return data;
  },

  // Re-runs the RAOD Gross lookup against every existing row — needed once
  // after fixing/adjusting the RAOD matching logic, since import only
  // computes Gross at creation time.
  recomputeGross: async (): Promise<{ updated: number }> => {
    const { data } = await api.post<{ updated: number }>(`${BASE}/recompute_gross/`);
    return data;
  },
};
