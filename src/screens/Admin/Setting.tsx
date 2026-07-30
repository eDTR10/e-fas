import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import AdminLayout from "./AdminLayout";
import ReferenceDataSettings from "./ReferenceDataSettings";
import AdaCounterSettings from "./AdaCounterSettings";
import NtcaBalanceCategorySettings from "./NtcaBalanceCategorySettings";

const Setting = () => {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(t);
  }, []);

  const handleSave = () => {
    setSaved(true);
    // TODO: send to API
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <AdminLayout title="Settings" subtitle="Configure your system">

      <div className=" flex flex-col gap-6">

        {/* ── General Settings ─────────────────────────────────────── */}
        {/* <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-foreground mb-5">General</h2>

          {loading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
              {Array.from({ length: 4 }).map((_, i) => <FormFieldSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
              {[
                { key: "siteName",  label: "Site Name",    type: "text",  placeholder: "My Admin Panel" },
                { key: "siteEmail", label: "Contact Email", type: "email", placeholder: "admin@example.com" },
                { key: "timezone",  label: "Timezone",      type: "text",  placeholder: "Asia/Manila" },
                { key: "language",  label: "Language",      type: "text",  placeholder: "English" },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">{label}</label>
                  <input
                    type={type}
                    value={general[key as keyof typeof general]}
                    onChange={(e) => setGeneral({ ...general, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                  />
                </div>
              ))}
            </div>
          )}
        </section> */}

        {/* ── Notification Settings ────────────────────────────────── */}
        {/* <section className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-foreground mb-5">Notifications</h2>

          {loading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="h-3.5 w-36 bg-muted rounded animate-pulse" />
                    <div className="h-2.5 w-52 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="h-6 w-11 bg-muted rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {[
                { key: "emailAlerts",   label: "Email Alerts",   desc: "Receive alerts via email" },
                { key: "smsAlerts",     label: "SMS Alerts",     desc: "Receive alerts via SMS" },
                { key: "systemUpdates", label: "System Updates", desc: "Get notified on system updates" },
                { key: "weeklyReport",  label: "Weekly Report",  desc: "Receive a summary every week" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div> */}
        {/* Toggle switch */}
        {/* <button
                    onClick={() => setNotifs({ ...notifs, [key]: !notifs[key as keyof typeof notifs] })}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
                      notifs[key as keyof typeof notifs] ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 mt-0.5 ${
                        notifs[key as keyof typeof notifs] ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section> */}

        {/* ── Budget Reference Data (PAP / Class Type / Fund Type / Object Codes) ── */}
        <ReferenceDataSettings />

        {/* ── ADA Counters (Custom Disbursement ledger) ──────────────── */}
        <AdaCounterSettings />

        {/* ── NTCA Balance Categories (SARO tagging per report section) ── */}
        <NtcaBalanceCategorySettings />

        {/* ── Danger Zone ──────────────────────────────────────────── */}
        <section className="bg-card border border-destructive/30 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-destructive mb-3">Danger Zone</h2>
          <p className="text-xs text-muted-foreground mb-4">
            These actions are irreversible. Please be certain before proceeding.
          </p>
          <button className="px-4 py-2 rounded-lg border border-destructive text-destructive text-sm font-medium hover:bg-destructive hover:text-destructive-foreground transition-colors">
            Reset All Settings
          </button>
        </section>

        {/* Save */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-5 py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saved ? "Saved!" : "Save Changes"}
          </button>
        </div>

      </div>
    </AdminLayout>
  );
};

export default Setting;
