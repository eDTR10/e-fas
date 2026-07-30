import api from "../screens/Auth/authService";

export interface ObjectCode {
  id: number;
  code: string;
  description: string;
}

export interface ClassType {
  id: number;
  code: string;
  name: string;
  money_range_min: string | null;
  money_range_max: string | null;
}

export interface ClassTypeImportRow {
  code: string;
  name: string;
  money_range_min: string | null;
  money_range_max: string | null;
  row_number: number;
  is_duplicate: boolean;
  id?: number;
}

export interface ClassTypeImportResult {
  dry_run: boolean;
  created: number;
  updated?: number;
  rows: ClassTypeImportRow[];
  warnings: string[];
}

export interface FundSource {
  id: number;
  code: string;
  name: string;
  is_sagf: boolean;
  sagf_type: "continuing" | "automatic" | null;
}

export interface FundSourceImportRow {
  code: string;
  name: string;
  is_sagf: boolean;
  sagf_type: "continuing" | "automatic" | null;
  row_number: number;
  is_duplicate: boolean;
  id?: number;
}

export interface FundSourceImportResult {
  dry_run: boolean;
  created: number;
  updated?: number;
  rows: FundSourceImportRow[];
  warnings: string[];
}

export interface PAP {
  id: number;
  code: string;
  name: string;
  particular: string;
  fund: number | null;
  class_type: number | null;
  fund_detail: FundSource | null;
  class_type_detail: ClassType | null;
  // Optional MDS Regular/Special/Trust tag — NTCA entries whose PAP Code
  // matches this PAP auto-fill their fund_cluster from here.
  fund_cluster: "mds_regular" | "mds_special" | "trust" | "";
}

function makeCrud<T, TPayload>(basePath: string) {
  return {
    list: async (): Promise<T[]> => {
      const { data } = await api.get<T[]>(basePath);
      return data;
    },
    create: async (payload: TPayload): Promise<T> => {
      const { data } = await api.post<T>(basePath, payload);
      return data;
    },
    update: async (id: number, payload: TPayload): Promise<T> => {
      const { data } = await api.patch<T>(`${basePath}${id}/`, payload);
      return data;
    },
    remove: async (id: number): Promise<void> => {
      await api.delete(`${basePath}${id}/`);
    },
  };
}

// ── Bulk import / clear-all — shared by code/name reference lists ──────────────
export interface CodeNameImportRow {
  code: string;
  name: string;
  row_number: number;
  is_duplicate: boolean;
  id?: number;
}

export interface CodeNameImportResult {
  dry_run: boolean;
  created: number;
  updated?: number;
  rows: CodeNameImportRow[];
  warnings: string[];
}

function makeBulk(basePath: string) {
  return {
    previewImport: async (text: string): Promise<CodeNameImportResult> => {
      const { data } = await api.post<CodeNameImportResult>(`${basePath}bulk_import/`, {
        csv_text: text,
        dry_run: "true",
      });
      return data;
    },
    confirmImport: async (rows: CodeNameImportRow[]): Promise<CodeNameImportResult> => {
      const { data } = await api.post<CodeNameImportResult>(`${basePath}bulk_import/`, {
        rows,
        dry_run: "false",
      });
      return data;
    },
    clearAll: async (): Promise<{ deleted: number }> => {
      const { data } = await api.post<{ deleted: number }>(`${basePath}clear_all/`);
      return data;
    },
  };
}

// Extended makeBulk for ClassType with extra fields
function makeClassTypeBulk(basePath: string) {
  return {
    previewImport: async (text: string): Promise<ClassTypeImportResult> => {
      const { data } = await api.post<ClassTypeImportResult>(`${basePath}bulk_import/`, {
        csv_text: text,
        dry_run: "true",
      });
      return data;
    },
    confirmImport: async (rows: ClassTypeImportRow[]): Promise<ClassTypeImportResult> => {
      const { data } = await api.post<ClassTypeImportResult>(`${basePath}bulk_import/`, {
        rows,
        dry_run: "false",
      });
      return data;
    },
    clearAll: async (): Promise<{ deleted: number }> => {
      const { data } = await api.post<{ deleted: number }>(`${basePath}clear_all/`);
      return data;
    },
  };
}

// Extended makeBulk for FundSource with extra fields
function makeFundSourceBulk(basePath: string) {
  return {
    previewImport: async (text: string): Promise<FundSourceImportResult> => {
      const { data } = await api.post<FundSourceImportResult>(`${basePath}bulk_import/`, {
        csv_text: text,
        dry_run: "true",
      });
      return data;
    },
    confirmImport: async (rows: FundSourceImportRow[]): Promise<FundSourceImportResult> => {
      const { data } = await api.post<FundSourceImportResult>(`${basePath}bulk_import/`, {
        rows,
        dry_run: "false",
      });
      return data;
    },
    clearAll: async (): Promise<{ deleted: number }> => {
      const { data } = await api.post<{ deleted: number }>(`${basePath}clear_all/`);
      return data;
    },
  };
}

export const objectCodeApi = {
  ...makeCrud<ObjectCode, Omit<ObjectCode, "id">>("/api/v1/saro/object-codes/"),
  ...makeBulk("/api/v1/saro/object-codes/"),
};
export const classTypeApi = {
  ...makeCrud<ClassType, Omit<ClassType, "id">>("/api/v1/saro/class-types/"),
  ...makeClassTypeBulk("/api/v1/saro/class-types/"),
};
export const fundSourceApi = {
  ...makeCrud<FundSource, Omit<FundSource, "id">>("/api/v1/saro/fund-sources/"),
  ...makeFundSourceBulk("/api/v1/saro/fund-sources/"),
};
export const papApi = {
  ...makeCrud<PAP, Omit<PAP, "id" | "fund_detail" | "class_type_detail">>("/api/v1/saro/paps/"),
  ...makeBulk("/api/v1/saro/paps/"),
};

// Explicitly re-export the interfaces so they can be imported by other modules