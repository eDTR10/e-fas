import { useEffect, useMemo, useState } from "react";
import { Search, FilePlus, FileEdit, FileX, ClipboardList } from "lucide-react";
import AdminLayout from "./AdminLayout";
import { TableSkeleton } from "./Skeleton";
import { Badge } from "../../components/ui/badge";
import { CategoryChip } from "../../components/ui/category-chip";
import KpiStrip from "../../components/ui/kpi-strip";
import { Pagination } from "../../components/ui/pagination";
import { RecordDetailDialog, type DetailField } from "../../components/ui/record-detail-dialog";
import { auditLogApi, AuditLog, AuditAction } from "../../lib/auditLogApi";
import { useTableSort, matchesColumnFilters } from "../../lib/useTableSort";
import { SortFilterHeader } from "../../components/ui/sortable-header";

const ACTION_BADGE: Record<AuditAction, "success" | "warning" | "destructive"> = {
  CREATE: "success",
  UPDATE: "warning",
  DELETE: "destructive",
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// A model_name reads friendlier to non-engineers as "SARO" instead of "SARO",
// but "UserAccount" instead of "User Account" — a couple of names get an
// explicit override, everything else is left as the raw model class name.
const MODEL_LABEL_OVERRIDES: Record<string, string> = {
  UserAccount: "User",
  ReceivedSARO: "Received SARO",
  ReceivedSAROLineItem: "Received SARO Line Item",
  NTCA: "NTCA",
  NtcaTagging: "NTCA Tagging",
  NtcaDisbursement: "Custom Disbursement",
  NtcaBalanceCategory: "NTCA Balance Category",
};
const modelLabel = (name: string): string => MODEL_LABEL_OVERRIDES[name] || name;

function ChangesDetail({ changes }: { changes: AuditLog["changes"] }) {
  const entries = Object.entries(changes || {});
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">No field-level changes recorded.</p>;
  // The DELETE/CREATE shape is a single { data: "<repr>" } entry, not a per-field diff.
  if (entries.length === 1 && entries[0][0] === "data") {
    return <p className="text-sm text-foreground break-words">{String((entries[0][1] as { data?: string })?.data ?? entries[0][1])}</p>;
  }
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Field</span><span>Before</span><span>After</span>
      </div>
      {entries.map(([field, change]) => {
        const c = change as { before?: string | null; after?: string | null };
        return (
          <div key={field} className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-3 py-2 border-b border-border last:border-0 text-xs items-start">
            <span className="text-foreground font-medium">{field}</span>
            <span className="text-muted-foreground break-words">{c?.before || "—"}</span>
            <span className="text-foreground break-words">{c?.after || "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main page — read-only, no create/edit/delete: this endpoint is a DRF
// ReadOnlyModelViewSet and every entry here is written automatically by
// AuditMixin (saro app) / _log_user_audit (accounts app), never by hand.
// ─────────────────────────────────────────────────────────────────────────
const AuditTrailPage = () => {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<AuditAction | "">("");
  const [modelFilter, setModelFilter] = useState("");
  const [viewing, setViewing] = useState<AuditLog | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = async () => {
    setLoading(true);
    try {
      setLogs(await auditLogApi.list({ ordering: "-timestamp" }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const availableModels = useMemo(() => {
    const models = new Set<string>();
    logs.forEach((l) => models.add(l.model_name));
    return Array.from(models).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter((l) => {
      if (actionFilter && l.action !== actionFilter) return false;
      if (modelFilter && l.model_name !== modelFilter) return false;
      if (!q) return true;
      return (
        l.object_repr.toLowerCase().includes(q) ||
        l.model_name.toLowerCase().includes(q) ||
        (l.performed_by_name || "").toLowerCase().includes(q)
      );
    });
  }, [logs, search, actionFilter, modelFilter]);

  // Per-column sort + filter on top of the search/action/model filters.
  const { sortKey, sortDir, toggleSort, applySort } = useTableSort<AuditLog>((row, key) => {
    switch (key) {
      case "action": return row.action;
      case "model_name": return modelLabel(row.model_name);
      case "object_repr": return row.object_repr;
      case "performed_by_name": return row.performed_by_name || "System";
      case "timestamp": return row.timestamp;
      default: return null;
    }
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const setColumnFilter = (key: string, value: string) => setColumnFilters((prev) => ({ ...prev, [key]: value }));

  const columnFiltered = useMemo(
    () => filtered.filter((row) => matchesColumnFilters(row, columnFilters, (r, key) => {
      switch (key) {
        case "action": return r.action;
        case "model_name": return modelLabel(r.model_name);
        case "object_repr": return r.object_repr;
        case "performed_by_name": return r.performed_by_name || "System";
        case "timestamp": return formatDateTime(r.timestamp);
        default: return "";
      }
    })),
    [filtered, columnFilters]
  );
  const sorted = useMemo(() => applySort(columnFiltered), [columnFiltered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, actionFilter, modelFilter, columnFilters, sorted.length]);

  const fields: DetailField[] = viewing ? [
    { label: "Model", value: modelLabel(viewing.model_name) },
    { label: "Record ID", value: viewing.object_id },
    { label: "Performed By", value: viewing.performed_by_name || "System" },
    { label: "Timestamp", value: formatDateTime(viewing.timestamp) },
    { label: "Record", value: viewing.object_repr, span: 2 },
  ] : [];

  return (
    <AdminLayout title="Audit Trail" subtitle="System-wide log of create, update, and delete actions">
      <div className="flex items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
        <div className="relative flex-1 max-w-xs sm:max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search record, model, performed by..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as AuditAction | "")}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">All Actions</option>
          <option value="CREATE">Create</option>
          <option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option>
        </select>
        <select
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 max-w-[220px]"
        >
          <option value="">All Models</option>
          {availableModels.map((m) => <option key={m} value={m}>{modelLabel(m)}</option>)}
        </select>
      </div>

      <KpiStrip cards={[
        { title: "Total Actions", value: String(filtered.length), icon: ClipboardList },
        { title: "Created", value: String(filtered.filter((l) => l.action === "CREATE").length), icon: FilePlus },
        { title: "Updated", value: String(filtered.filter((l) => l.action === "UPDATE").length), icon: FileEdit },
        { title: "Deleted", value: String(filtered.filter((l) => l.action === "DELETE").length), icon: FileX },
      ]} />

      {loading ? (
        <TableSkeleton rows={8} />
      ) : (
        <div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[90px_1fr_1.4fr_1fr_1fr] gap-4 px-5 py-3 border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide slg:grid-cols-[90px_1fr_1.4fr]">
              <SortFilterHeader label="Action" sortKey="action" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.action || ""} onFilterChange={(v) => setColumnFilter("action", v)} filterPlaceholder="Filter…" />
              <SortFilterHeader label="Model" sortKey="model_name" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.model_name || ""} onFilterChange={(v) => setColumnFilter("model_name", v)} filterPlaceholder="Filter…" />
              <SortFilterHeader label="Record" sortKey="object_repr" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.object_repr || ""} onFilterChange={(v) => setColumnFilter("object_repr", v)} filterPlaceholder="Filter…" />
              <div className="slg:hidden">
                <SortFilterHeader label="Performed By" sortKey="performed_by_name" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                  filterValue={columnFilters.performed_by_name || ""} onFilterChange={(v) => setColumnFilter("performed_by_name", v)} filterPlaceholder="Filter…" />
              </div>
              <div className="slg:hidden">
                <SortFilterHeader label="When" sortKey="timestamp" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                  filterValue={columnFilters.timestamp || ""} onFilterChange={(v) => setColumnFilter("timestamp", v)} filterPlaceholder="Filter…" />
              </div>
            </div>

            {paginatedData.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">No audit log entries found.</div>
            ) : (
              paginatedData.map((l) => (
                <div
                  key={l.id}
                  onClick={() => setViewing(l)}
                  className="grid grid-cols-[90px_1fr_1.4fr_1fr_1fr] gap-4 px-5 py-3.5 border-b border-border last:border-0 items-center hover:bg-accent/40 transition-colors slg:grid-cols-[90px_1fr_1.4fr] cursor-pointer"
                >
                  <Badge variant={ACTION_BADGE[l.action]}>{l.action}</Badge>
                  <div className="min-w-0"><CategoryChip label={modelLabel(l.model_name)} /></div>
                  <p className="text-sm text-foreground truncate" title={l.object_repr}>{l.object_repr || "—"}</p>
                  <p className="text-sm text-foreground truncate slg:hidden">{l.performed_by_name || "System"}</p>
                  <p className="text-xs text-muted-foreground slg:hidden">{formatDateTime(l.timestamp)}</p>
                </div>
              ))
            )}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            totalItems={filtered.length}
            onPageSizeChange={setPageSize}
            availablePageSizes={[10, 25, 50, 100]}
          />
        </div>
      )}

      {!loading && (
        <p className="text-xs text-muted-foreground mt-3">Showing {paginatedData.length} of {sorted.length} log entries (page {currentPage} of {totalPages})</p>
      )}

      {viewing && (
        <RecordDetailDialog
          open={!!viewing}
          onOpenChange={(open) => !open && setViewing(null)}
          eyebrow="Audit Log Entry"
          title={`${viewing.action} — ${modelLabel(viewing.model_name)}`}
          subtitle={viewing.object_repr}
          chips={<Badge variant={ACTION_BADGE[viewing.action]}>{viewing.action}</Badge>}
          stats={[]}
          extra={<ChangesDetail changes={viewing.changes} />}
          fields={fields}
        />
      )}
    </AdminLayout>
  );
};

export default AuditTrailPage;
