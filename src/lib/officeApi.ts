import api from "../screens/Auth/authService";

const BASE = "/api/v1/office";

export interface Office {
  officeID: number;
  name: string;
  officeMail: string;
  street: string;
  city: string;
  province: string;
  region: string;
  numUsers: number;
  coordinates: string;
}

// Slim shape from /office/slim/ — no auth required, used for dropdowns.
export interface OfficeSlim {
  office_id: number;
  name: string;
}

export const officeApi = {
  list: async (): Promise<Office[]> => {
    const { data } = await api.get<Office[]>(`${BASE}/`);
    return data;
  },

  slim: async (): Promise<OfficeSlim[]> => {
    const { data } = await api.get<OfficeSlim[]>(`${BASE}/slim/`);
    return data;
  },
};
