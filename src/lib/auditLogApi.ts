import api from "../screens/Auth/authService";

const BASE = "/api/v1/saro/audit-logs";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

export interface AuditLogChange {
  before: string | null;
  after: string | null;
}

export interface AuditLog {
  id: number;
  action: AuditAction;
  model_name: string;
  object_id: string;
  object_repr: string;
  changes: Record<string, AuditLogChange> | { data?: string };
  performed_by: number | null;
  performed_by_name: string;
  timestamp: string;
}

export const auditLogApi = {
  // Read-only — this endpoint is a DRF ReadOnlyModelViewSet, list/retrieve only.
  list: async (params?: { search?: string; ordering?: string }): Promise<AuditLog[]> => {
    const { data } = await api.get<AuditLog[]>(`${BASE}/`, {
      params: { search: params?.search || undefined, ordering: params?.ordering || undefined },
    });
    return data;
  },
};
