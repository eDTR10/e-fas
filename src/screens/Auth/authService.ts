import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const API_PREFIX = "/api/v1";

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach the DRF auth token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

// Token rejected/expired server-side — clear it and bounce to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("auth_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  re_password: string;
  [key: string]: unknown;
}

export interface UserProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  position: string;
  office: number | null;
  projects: number[];
  acc_lvl: number;
  is_active: boolean;
  is_staff: boolean;
  role: string;
}

// Backend uses djoser + DRF TokenAuthentication (Authorization: Token <key>),
// not JWT — there is no refresh token/endpoint to rotate.
export const authService = {
  login: async (payload: LoginPayload): Promise<string> => {
    const { data } = await api.post<{ auth_token: string }>(
      `${API_PREFIX}/token/login/`,
      payload
    );
    localStorage.setItem("auth_token", data.auth_token);
    return data.auth_token;
  },

  register: async (payload: RegisterPayload): Promise<UserProfile> => {
    const { data } = await api.post<UserProfile>(`${API_PREFIX}/users/`, payload);
    return data;
  },

  getMe: async (): Promise<UserProfile> => {
    const { data } = await api.get<UserProfile>(`${API_PREFIX}/users/me/`);
    return data;
  },

  logout: () => {
    if (localStorage.getItem("auth_token")) {
      api.post(`${API_PREFIX}/token/logout/`).catch(() => {});
    }
    localStorage.removeItem("auth_token");
  },

  isAuthenticated: (): boolean => {
    return !!localStorage.getItem("auth_token");
  },
};

export default api;
