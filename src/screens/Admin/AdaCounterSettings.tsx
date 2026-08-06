import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { AdaCounter, adaCounterApi } from "../../lib/ntcaDisbursementApi";

const swalTheme = {
  background: "hsl(var(--background))",
  color: "hsl(var(--foreground))",
};

const AdaCounterSettings = () => {
  const [counters, setCounters] = useState<AdaCounter[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adaCounterApi.list();
      setCounters(data);
      setDraft(String(Math.max(1, ...data.map((counter) => counter.next_number))));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const currentValue = Math.max(
    1,
    ...counters.map((counter) => counter.next_number),
  );

  const handleSave = async () => {
    const value = Number(draft);
    if (!Number.isInteger(value) || value < 1) {
      Swal.fire({
        icon: "error",
        title: "Enter a whole number of 1 or more",
        ...swalTheme,
      });
      return;
    }
    if (!counters[0]) return;

    setSaving(true);
    try {
      // Update every legacy row as well as the shared server-side value so
      // this remains safe while older API deployments are being upgraded.
      await Promise.all(
        counters.map((counter) => adaCounterApi.update(counter.id, value)),
      );
      await load();
      Swal.fire({
        icon: "success",
        title: "Shared ADA counter updated",
        timer: 1000,
        showConfirmButton: false,
        ...swalTheme,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Shared ADA Counter</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        MDS Regular, MDS Special, and Trust use one ADA sequence, preventing
        the same number from being generated twice in one year. Adjust this
        only when starting an approved new series.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex max-w-md items-center gap-3">
          <span className="w-32 shrink-0 text-sm text-foreground">Next ADA number</span>
          <Input
            type="number"
            min="1"
            className="w-32"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="text-foreground"
            disabled={saving || draft === String(currentValue)}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </section>
  );
};

export default AdaCounterSettings;
