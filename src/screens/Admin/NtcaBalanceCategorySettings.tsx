import { useEffect, useState } from "react";
import { Search, Plus, Pencil, Trash2, X } from "lucide-react";
import Swal from "sweetalert2";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../../components/ui/dialog";
import { TableSkeleton } from "./Skeleton";
import { QuickFillSelect } from "../../components/ui/quick-fill-select";
import {
  ntcaBalanceApi, NtcaBalanceCategory, NtcaBalanceCategorySaro, FUND_CLUSTER_OPTIONS,
} from "../../lib/ntcaBalanceApi";
import { receivedSaroApi, ReceivedSARO } from "../../lib/receivedSaroApi";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

function extractError(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return "Failed to save. Please try again.";
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// Row shape used while editing a category's tagged SARO list — mirrors
// NtcaBalanceCategorySaro but `id` is optional (new tags don't have one yet).
type SaroRow = Omit<NtcaBalanceCategorySaro, "id"> & { id?: number };

const emptySaroRow = (): SaroRow => ({
  saro_no: "", pap: "", purpose: "", pap_code: "", class_type_label: "", order: 0, default_fund_cluster: "",
});

// ─────────────────────────────────────────────────────────────────────────
// NTCA Balance Categories — the "Personal Services / PNPKI / Cybersecurity
// / ..." groupings on the NTCA Balance report, and which SARO No.(s) are
// tagged under each. This is the day-to-day editing surface for that
// grouping (add/rename a category, tag/untag a SARO No.) — separate from
// the NTCA Balance page's own "Bulk Import Categories", which replaces the
// *entire* grouping at once from a pasted spreadsheet.
// ─────────────────────────────────────────────────────────────────────────
export default function NtcaBalanceCategorySettings() {
  const [items, setItems] = useState<NtcaBalanceCategory[]>([]);
  const [saroList, setSaroList] = useState<ReceivedSARO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NtcaBalanceCategory | null>(null);
  const [name, setName] = useState("");
  const [order, setOrder] = useState("0");
  const [saroRows, setSaroRows] = useState<SaroRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await ntcaBalanceApi.list());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    receivedSaroApi.list({}).then(setSaroList);
  }, []);

  const openAdd = () => {
    setEditing(null);
    setName("");
    setOrder(String(items.length));
    setSaroRows([]);
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (item: NtcaBalanceCategory) => {
    setEditing(item);
    setName(item.name);
    setOrder(String(item.order));
    setSaroRows(item.saros.map((s) => ({ ...s })));
    setError(null);
    setFormOpen(true);
  };

  const addSaroRow = () => setSaroRows((prev) => [...prev, emptySaroRow()]);
  const removeSaroRow = (i: number) => setSaroRows((prev) => prev.filter((_, j) => j !== i));
  const updateSaroRow = <K extends keyof SaroRow>(i: number, field: K, value: SaroRow[K]) =>
    setSaroRows((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  // Picking a SARO No. from the list auto-fills PAP/Purpose/PAP Code/Class
  // Type from its Received SARO record — one less thing to type by hand.
  const pickSaro = (i: number, s: ReceivedSARO) =>
    setSaroRows((prev) => prev.map((r, j) => (j === i ? {
      ...r,
      saro_no: s.saro_no,
      pap: s.pap_name || r.pap,
      purpose: s.particulars || r.purpose,
      pap_code: s.pap_code || r.pap_code,
      class_type_label: s.class_type_label || r.class_type_label,
    } : r)));

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Category name is required.");
      return;
    }
    const cleanedRows = saroRows.filter((r) => r.saro_no.trim());
    if (saroRows.some((r) => !r.saro_no.trim())) {
      setError("Every tagged SARO row needs a SARO No. — remove any blank rows first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        order: Number(order) || 0,
        saros: cleanedRows.map((r, i) => ({ ...r, saro_no: r.saro_no.trim(), order: i })),
      };
      if (editing) await ntcaBalanceApi.update(editing.id, payload);
      else await ntcaBalanceApi.create(payload);
      Swal.fire({ icon: "success", title: editing ? "Category updated" : "Category added", timer: 1200, showConfirmButton: false, ...swalTheme });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: NtcaBalanceCategory) => {
    const result = await Swal.fire({
      icon: "warning", title: `Delete "${item.name}"?`,
      text: `This removes the category and all ${item.saros.length} tagged SARO No.(s) under it. This cannot be undone.`,
      showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await ntcaBalanceApi.remove(item.id);
    load();
  };

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return i.name.toLowerCase().includes(q) || i.saros.some((s) => s.saro_no.toLowerCase().includes(q));
  });

  return (
    <section className="bg-card border border-border rounded-xl p-6">
      <h2 className="text-sm font-semibold text-foreground mb-1">NTCA Balance Categories</h2>
      <p className="text-xs text-muted-foreground mb-4">
        The report sections on the NTCA Balance page (Personal Services, PNPKI, Cybersecurity, etc.) and which SARO No.(s) are tagged under each — that tagging is the basis for each category's NTCA Received / Disbursements / Balance figures, computed live per quarter.
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search category or SARO No..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Category
            </Button>
          </div>
        </div>

        {loading ? <TableSkeleton rows={4} /> : (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_90px_110px_70px] gap-3 px-4 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Category</span>
              <span>Order</span>
              <span>Tagged SAROs</span>
              <span />
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground text-center">No categories.</div>
              ) : (
                filtered.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_90px_110px_70px] gap-3 px-4 py-2.5 border-b border-border last:border-0 items-center text-sm hover:bg-accent/30 transition-colors">
                    <span className="text-foreground truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.order}</span>
                    <span className="text-xs text-muted-foreground">{item.saros.length}</span>
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(item)} className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item)} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{filtered.length} of {items.length}</p>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="border-b border-border">
            <DialogTitle>{editing ? `Edit "${editing.name}"` : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="px-4 py-4 flex flex-col gap-4 overflow-y-auto">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-2.5">{error}</div>
            )}
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <Field label="Category Name *">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cybersecurity" />
              </Field>
              <Field label="Order">
                <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
              </Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Tagged SARO No.(s)</p>
                <Button size="sm" variant="outline" className="text-foreground" onClick={addSaroRow}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Tag a SARO
                </Button>
              </div>
              {saroRows.length === 0 ? (
                <p className="text-xs text-muted-foreground border border-dashed border-border rounded-lg px-3 py-4 text-center">No SARO No.(s) tagged yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {saroRows.map((row, i) => (
                    <div key={i} className="border border-border rounded-lg p-2.5 flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <QuickFillSelect
                            placeholder="Pick from Received SARO list…"
                            items={saroList}
                            getLabel={(s) => `${s.saro_no} — ${s.pap_name || "(no PAP name)"}`}
                            onPick={(s) => pickSaro(i, s)}
                          />
                          <Input
                            className="mt-1.5"
                            placeholder="SARO No."
                            value={row.saro_no}
                            onChange={(e) => updateSaroRow(i, "saro_no", e.target.value)}
                          />
                        </div>
                        <select
                          value={row.default_fund_cluster}
                          onChange={(e) => updateSaroRow(i, "default_fund_cluster", e.target.value as SaroRow["default_fund_cluster"])}
                          className="mt-0 rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 shrink-0"
                          title="Fallback fund cluster — overridden once a real NTCA record tags this SARO No. to one"
                        >
                          <option value="">Unclassified</option>
                          {FUND_CLUSTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <button
                          onClick={() => removeSaroRow(i)}
                          className="p-2 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {(row.pap || row.purpose) && (
                        <p className="text-[11px] text-muted-foreground truncate pl-1">{row.pap}{row.pap && row.purpose ? " — " : ""}{row.purpose}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="border-t border-border justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
