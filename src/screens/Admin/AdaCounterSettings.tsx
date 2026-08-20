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
  const [resetting, setResetting] = useState(false);

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

  const handleReset = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Reset the shared ADA counter to #001?",
      text: "Only do this for an approved new series (e.g. a new year). If this year already has disbursements, the counter will auto-advance past them again the next time it's loaded — this reset only sticks when there's nothing this year to conflict with.",
      showCancelButton: true,
      confirmButtonText: "Reset to #001",
      confirmButtonColor: "#dc2626",
      ...swalTheme,
    });
    if (!result.isConfirmed) return;
    setResetting(true);
    try {
      await adaCounterApi.reset();
      await load();
      Swal.fire({
        icon: "success",
        title: "Reset to #001",
        timer: 1000,
        showConfirmButton: false,
        ...swalTheme,
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Shared ADA Counter</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        MDS Regular, MDS Special, and Trust use one ADA sequence, preventing
        the same number from being generated twice in one year. It auto-adjusts
        to stay ahead of whatever ADA number is actually highest on file for the
        current year (imported or hand-edited), so it can't drift out of sync or
        suggest a number already in use. Adjust it manually, or reset it, only
        when starting an approved new series.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex max-w-xl items-center gap-3 flex-wrap">
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
            disabled={saving || resetting || draft === String(currentValue)}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive ml-auto"
            disabled={saving || resetting}
            onClick={handleReset}
          >
            {resetting ? "Resetting…" : "Reset to #001"}
          </Button>
        </div>
      )}
    </section>
  );
};

export default AdaCounterSettings;
