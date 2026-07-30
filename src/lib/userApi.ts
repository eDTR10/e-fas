import api from "../screens/Auth/authService";

const BASE = "/api/v1/users/manage";

export type UserRole = "admin" | "budget" | "accounting" | "cashier" | "provincial_officer" | "user";

export const USER_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "budget", label: "Budget" },
  { value: "accounting", label: "Accounting" },
  { value: "cashier", label: "Cashier" },
  { value: "provincial_officer", label: "Provincial Officer" },
  { value: "user", label: "User" },
];

export interface UserAccount {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  position: string;
  office: number | null;
  projects: number[];
  acc_lvl: number;
  is_active: boolean;
  // Kept in sync server-side with role==='admin' — not independently editable.
  is_staff: boolean;
  role: UserRole;
}

export type UserCreatePayload = Omit<UserAccount, "id" | "is_staff"> & { password: string };
// Password optional on update — omit it to leave the password unchanged.
export type UserUpdatePayload = Partial<Omit<UserAccount, "id" | "is_staff">> & { password?: string };

export const userApi = {
  list: async (): Promise<UserAccount[]> => {
    const { data } = await api.get<UserAccount[]>(`${BASE}/`);
    return data;
  },

  create: async (payload: UserCreatePayload): Promise<UserAccount> => {
    const { data } = await api.post<UserAccount>(`${BASE}/`, payload);
    return data;
  },

  update: async (id: number, payload: UserUpdatePayload): Promise<UserAccount> => {
    const { data } = await api.patch<UserAccount>(`${BASE}/${id}/`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/${id}/`);
  },
};
