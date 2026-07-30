import type { InternalAxiosRequestConfig } from "axios";

export const OPERATION_STARTED_EVENT = "efas:operation-started";
export const OPERATION_FINISHED_EVENT = "efas:operation-finished";

export interface OperationStartedDetail {
  id: string;
  label: string;
}

export interface OperationFinishedDetail {
  id: string;
}

export type OperationTrackedConfig = InternalAxiosRequestConfig & {
  __efasOperationId?: string;
};

const TABLE_LABELS: Record<string, string> = {
  raod: "RAOD",
  received_saro: "Received SARO",
  received_ntca: "Received NTCA",
  disbursement_tracker: "Disbursement Tracker",
  cashiering_tracker: "Cashiering Tracker",
};

const readPayload = (config: InternalAxiosRequestConfig): Record<string, unknown> => {
  if (config.data && typeof config.data === "object") {
    return config.data as Record<string, unknown>;
  }

  if (typeof config.data === "string") {
    try {
      return JSON.parse(config.data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  return {};
};

export function getTrackedOperationLabel(config: InternalAxiosRequestConfig): string | null {
  const url = (config.url || "").toLowerCase();
  const payload = readPayload(config);

  if (url.includes("bulk_import") || url.includes("bulk-import")) {
    const isConfirmation =
      payload.confirm === true ||
      Array.isArray(payload.rows) ||
      Array.isArray(payload.groups);
    return isConfirmation ? "Importing records" : "Preparing import preview";
  }

  if (url.includes("/sync/") || url.endsWith("/sync")) {
    const table = typeof payload.table === "string" ? payload.table : "";
    return `Syncing ${TABLE_LABELS[table] || "Google Sheets"}`;
  }

  return null;
}

export function startTrackedOperation(config: OperationTrackedConfig, label: string): void {
  if (typeof window === "undefined") return;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  config.__efasOperationId = id;
  window.dispatchEvent(new CustomEvent<OperationStartedDetail>(OPERATION_STARTED_EVENT, {
    detail: { id, label },
  }));
}

export function finishTrackedOperation(config?: OperationTrackedConfig): void {
  if (typeof window === "undefined" || !config?.__efasOperationId) return;
  window.dispatchEvent(new CustomEvent<OperationFinishedDetail>(OPERATION_FINISHED_EVENT, {
    detail: { id: config.__efasOperationId },
  }));
  delete config.__efasOperationId;
}
