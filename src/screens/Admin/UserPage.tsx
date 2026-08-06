import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Pencil, Trash2, Users, ShieldCheck, UserX, Building2 } from "lucide-react";
import Swal from "sweetalert2";
import AdminLayout from "./AdminLayout";
import { TableSkeleton } from "./Skeleton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import KpiStrip from "../../components/ui/kpi-strip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import { userApi, UserAccount, UserRole, USER_ROLE_OPTIONS } from "../../lib/userApi";
import { officeApi, OfficeSlim } from "../../lib/officeApi";
import { useAuth } from "../Auth/AuthContext";
import { Pagination } from "../../components/ui/pagination";
import { BulkActionBar } from "../../components/ui/bulk-action-bar";
import { SelectAllCheckbox } from "../../components/ui/select-all-checkbox";
import { useSelection } from "../../lib/useSelection";
import { useTableSort, matchesColumnFilters } from "../../lib/useTableSort";
import { SortFilterHeader } from "../../components/ui/sortable-header";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

function extractError(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return "Failed to save. Please try again.";
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ");
}

const roleLabel = (role: UserRole): string => USER_ROLE_OPTIONS.find((o) => o.value === role)?.label || role;

// Fixed (not hashed) so each role always reads the same color everywhere —
// unlike free-text categorical fields, the role set is small and closed.
const ROLE_BADGE_VARIANT: Record<UserRole, "success" | "blue" | "purple" | "teal" | "orange" | "secondary"> = {
  admin: "success",
  budget: "blue",
  accounting: "purple",
  cashier: "teal",
  provincial_officer: "orange",
  user: "secondary",
};

// ── form value shape (everything as strings — that's what inputs give us) ──
interface UserForm {
  email: string;
  first_name: string;
  last_name: string;
  position: string;
  office: string; // Office id, as a string for the <select>
  acc_lvl: string;
  role: UserRole;
  is_active: boolean;
  password: string; // blank on edit = leave unchanged
}

const emptyForm = (): UserForm => ({
  email: "", first_name: "", last_name: "", position: "", office: "",
  acc_lvl: "3", role: "user", is_active: true, password: "",
});

const userToForm = (u: UserAccount): UserForm => ({
  email: u.email,
  first_name: u.first_name,
  last_name: u.last_name,
  position: u.position,
  office: u.office ? String(u.office) : "",
  acc_lvl: String(u.acc_lvl),
  role: u.role,
  is_active: u.is_active,
  password: "",
});

// ─────────────────────────────────────────────────────────────────────────
// Add / Edit dialog
// ─────────────────────────────────────────────────────────────────────────
function UserFormDialog({
  open, onOpenChange, editing, onSaved, officeList,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: UserAccount | null;
  onSaved: () => void;
  officeList: OfficeSlim[];
}) {
  const [form, setForm] = useState<UserForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(editing ? userToForm(editing) : emptyForm());
      setError(null);
    }
  }, [open, editing]);

  const update = <K extends keyof UserForm>(field: K, value: UserForm[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.email.trim() || !form.first_name.trim() || !form.last_name.trim()) {
      setError("Email, First Name, and Last Name are required.");
      return;
    }
    if (!editing && !form.password.trim()) {
      setError("Password is required for a new user.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const base = {
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        position: form.position.trim(),
        office: form.office ? Number(form.office) : null,
        acc_lvl: form.acc_lvl ? Number(form.acc_lvl) : 3,
        role: form.role,
        is_active: form.is_active,
        projects: editing?.projects || [],
      };
      if (editing) {
        await userApi.update(editing.id, { ...base, ...(form.password.trim() ? { password: form.password } : {}) });
      } else {
        await userApi.create({ ...base, password: form.password });
      }
      Swal.fire({ icon: "success", title: editing ? "User updated" : "User added", timer: 1300, showConfirmButton: false, ...swalTheme });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {node}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>{editing ? `Edit ${editing.first_name} ${editing.last_name}` : "Add User"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
            {field("Email *", <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="user@dict.gov.ph" />)}
            {field(editing ? "Password (leave blank to keep unchanged)" : "Password *", (
              <Input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder={editing ? "••••••••" : "Set a password"} />
            ))}
            {field("First Name *", <Input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />)}
            {field("Last Name *", <Input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />)}
            {field("Position", <Input value={form.position} onChange={(e) => update("position", e.target.value)} placeholder="e.g. Budget Officer II" />)}
            {field("Office", (
              <select
                value={form.office}
                onChange={(e) => update("office", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              >
                <option value="">—</option>
                {officeList.map((o) => <option key={o.office_id} value={o.office_id}>{o.name}</option>)}
              </select>
            ))}
            {field("Role", (
              <select
                value={form.role}
                onChange={(e) => update("role", e.target.value as UserRole)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
              >
                {USER_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ))}
            {field("Access Level", <Input type="number" value={form.acc_lvl} onChange={(e) => update("acc_lvl", e.target.value)} />)}
            {field("Status", (
              <label className="flex items-center gap-2 h-10 text-sm text-foreground">
                <input type="checkbox" checked={form.is_active} onChange={(e) => update("is_active", e.target.checked)} />
                Active
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Note: choosing role "Admin" automatically grants staff/admin access; any other role removes it.
          </p>
        </div>

        <DialogFooter className="border-t border-border justify-end gap-2">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────
const UserPage = () => {
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [officeList, setOfficeList] = useState<OfficeSlim[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await userApi.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    officeApi.slim().then(setOfficeList);
  }, []);

  const officeById = useMemo(() => {
    const map = new Map<number, string>();
    officeList.forEach((o) => map.set(o.office_id, o.name));
    return map;
  }, [officeList]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.first_name.toLowerCase().includes(q) ||
        u.last_name.toLowerCase().includes(q) ||
        u.position.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  // Per-column sort + filter on top of the search/role filters above.
  const { sortKey, sortDir, toggleSort, applySort } = useTableSort<UserAccount>((row, key) => {
    switch (key) {
      case "name": return `${row.first_name} ${row.last_name}`.trim() || row.email;
      case "office": return row.office ? officeById.get(row.office) || "" : "";
      case "role": return roleLabel(row.role);
      case "status": return row.is_active ? 1 : 0;
      default: return null;
    }
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const setColumnFilter = (key: string, value: string) => setColumnFilters((prev) => ({ ...prev, [key]: value }));

  const columnFiltered = useMemo(
    () => filtered.filter((row) => matchesColumnFilters(row, columnFilters, (r, key) => {
      switch (key) {
        case "name": return `${r.first_name} ${r.last_name} ${r.email}`;
        case "office": return r.office ? officeById.get(r.office) || "" : "";
        case "role": return roleLabel(r.role);
        case "status": return r.is_active ? "active" : "inactive";
        default: return "";
      }
    })),
    [filtered, columnFilters, officeById]
  );
  const sorted = useMemo(() => applySort(columnFiltered), [columnFiltered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, columnFilters, sorted.length]);

  const pageIds = useMemo(() => paginatedData.map((u) => u.id), [paginatedData]);
  const { selected, toggle, toggleAll, clear: clearSelection, isAllSelected, isSomeSelected } = useSelection<number>();

  const handleAdd = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (u: UserAccount) => { setEditing(u); setFormOpen(true); };

  const handleDelete = async (u: UserAccount) => {
    if (currentUser && u.id === currentUser.id) {
      Swal.fire({ icon: "error", title: "You cannot delete your own account.", ...swalTheme });
      return;
    }
    const result = await Swal.fire({
      icon: "warning", title: `Delete ${u.first_name} ${u.last_name}?`, text: "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await userApi.remove(u.id);
    load();
  };

  const handleBulkDelete = async () => {
    const idsToDelete = [...selected].filter((id) => !currentUser || id !== currentUser.id);
    const skippedSelf = selected.size - idsToDelete.length;
    const count = idsToDelete.length;
    if (count === 0) {
      Swal.fire({ icon: "info", title: "Nothing to delete", text: "Your own account can't be deleted.", ...swalTheme });
      return;
    }
    const result = await Swal.fire({
      icon: "warning",
      title: `Delete ${count} user${count === 1 ? "" : "s"}?`,
      text: skippedSelf ? "This cannot be undone. Your own account will be skipped." : "This cannot be undone.",
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await Promise.all(idsToDelete.map((id) => userApi.remove(id)));
    clearSelection();
    load();
  };

  return (
    <AdminLayout title="User Management" subtitle="Manage system users, roles, and office assignments">
      <div className="flex items-center gap-3 mb-5 sm:flex-col sm:items-stretch">
        <div className="relative flex-1 max-w-xs sm:max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search name, email, position..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">All Roles</option>
          {USER_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex gap-2 ml-auto sm:ml-0">
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" /> Add User
          </Button>
        </div>
      </div>

      <KpiStrip cards={[
        { title: "Total Users", value: String(filtered.length), icon: Users },
        { title: "Active", value: String(filtered.filter((u) => u.is_active).length), icon: ShieldCheck },
        { title: "Inactive", value: String(filtered.filter((u) => !u.is_active).length), icon: UserX },
        { title: "Admins", value: String(filtered.filter((u) => u.role === "admin").length), icon: Building2 },
      ]} />

      <BulkActionBar count={selected.size} itemLabel="user" onDelete={handleBulkDelete} onClear={clearSelection} />

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[24px_2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide slg:grid-cols-[24px_2fr_1fr_auto]">
              <SelectAllCheckbox checked={isAllSelected(pageIds)} indeterminate={isSomeSelected(pageIds)} onChange={() => toggleAll(pageIds)} />
              <SortFilterHeader label="User" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.name || ""} onFilterChange={(v) => setColumnFilter("name", v)} filterPlaceholder="Filter…" />
              <div className="slg:hidden">
                <SortFilterHeader label="Office" sortKey="office" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                  filterValue={columnFilters.office || ""} onFilterChange={(v) => setColumnFilter("office", v)} filterPlaceholder="Filter…" />
              </div>
              <SortFilterHeader label="Role" sortKey="role" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                filterValue={columnFilters.role || ""} onFilterChange={(v) => setColumnFilter("role", v)} filterPlaceholder="Filter…" />
              <div className="slg:hidden">
                <SortFilterHeader label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={toggleSort}
                  filterValue={columnFilters.status || ""} onFilterChange={(v) => setColumnFilter("status", v)} filterPlaceholder="Filter…" />
              </div>
              <span>Actions</span>
            </div>

            {paginatedData.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">No users found.</div>
            ) : (
              paginatedData.map((u) => (
                <div
                  key={u.id}
                  onClick={() => handleEdit(u)}
                  className="grid grid-cols-[24px_2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3.5 border-b border-border last:border-0 items-center hover:bg-accent/40 transition-colors slg:grid-cols-[24px_2fr_1fr_auto] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggle(u.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 shrink-0 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold uppercase">
                      {(u.first_name.slice(0, 1) + u.last_name.slice(0, 1)) || u.email.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {u.first_name} {u.last_name}
                        {currentUser && u.id === currentUser.id && <Badge variant="secondary" className="ml-2">you</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>
                  <p className="text-sm text-foreground truncate slg:hidden">{u.office ? officeById.get(u.office) || "—" : "—"}</p>
                  <Badge variant={ROLE_BADGE_VARIANT[u.role] || "outline"}>{roleLabel(u.role)}</Badge>
                  <div className="slg:hidden">
                    <Badge variant={u.is_active ? "success" : "secondary"}>{u.is_active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleEdit(u)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {/* <button onClick={() => handleDelete(u)} className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button> */}
                  </div>
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
        <p className="text-xs text-muted-foreground mt-3">Showing {paginatedData.length} of {sorted.length} user(s) (page {currentPage} of {totalPages})</p>
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={load} officeList={officeList} />
    </AdminLayout>
  );
};

export default UserPage;
