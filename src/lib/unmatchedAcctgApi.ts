import api from "../screens/Auth/authService";

const BASE = "/api/v1/saro/unmatched-acctg-entries";

// DVs the Acctg (Net) sheet reports Net Amount for but that have no
// matching row in Disbursement Tracker — rebuilt from scratch on every
// Net (Acctg) sheet sync (see apply_acctg_net_rows in saro/importers.py).
// Read-only: there's nothing to edit here, only to add to the DV sheet.
export interface UnmatchedAcctgEntry {
  id: number;
  dv_number: string;
  ors_no: string;
  // The Acctg sheet's own SARO No. (else the one this ORS No. resolves to through RAOD, "" if none) — the key the NTCA Balance report groups by.
  saro_no: string;
  net: string;
  // The Acctg sheet's Date for this row (YYYY-MM-DD) — places it in a quarter on the NTCA Balance. null on entries synced before it was captured.
  date: string | null;
  synced_at: string;
}

export const unmatchedAcctgApi = {
  list: async (params?: { search?: string }): Promise<UnmatchedAcctgEntry[]> => {
    const { data } = await api.get<UnmatchedAcctgEntry[]>(`${BASE}/`, {
      params: { search: params?.search || undefined },
    });
    return data;
  },
};
