import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { adaCounterApi, AdaCounter } from "../../lib/ntcaDisbursementApi";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

const AdaCounterSettings = () => {
  const [counters, setCounters] = useState<AdaCounter[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adaCounterApi.list();
      setCounters(data);
      setDrafts(Object.fromEntries(data.map((c) => [c.id, String(c.next_number)])));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (counter: AdaCounter) => {
    const value = Number(drafts[counter.id]);
    if (!Number.isInteger(value) || value < 1) {
      Swal.fire({ icon: "error", title: "Enter a whole number of 1 or more", ...swalTheme });
      return;
    }
    setSavingId(counter.id);
    try {
      await adaCounterApi.update(counter.id, value);
      Swal.fire({ icon: "success", title: "Updated", timer: 1000, showConfirmButton: false, ...swalTheme });
      load();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="bg-card border border-border rounded-xl p-6">
      <h2 className="text-sm font-semibold text-foreground mb-1">ADA Counters</h2>
      <p className="text-xs text-muted-foreground mb-4">
        The next ADA (Authority to Debit Account) number suggested when adding an NCA Tracker entry, per fund cluster.
        It advances automatically each time a disbursement is saved — adjust it here if you ever need to correct it.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3 max-w-md">
          {counters.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className="text-sm text-foreground w-32 shrink-0">{c.fund_cluster_display}</span>
              <Input
                type="number"
                className="w-32"
                value={drafts[c.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="outline"
                className="text-foreground"
                disabled={savingId === c.id || drafts[c.id] === String(c.next_number)}
                onClick={() => handleSave(c)}
              >
                {savingId === c.id ? "Saving…" : "Save"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default AdaCounterSettings;
