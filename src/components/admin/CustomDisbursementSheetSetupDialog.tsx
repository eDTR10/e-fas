import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { SourceListSection } from "./SheetSyncManagerDialog";
import {
  sheetSyncApi, SheetSyncSource, NTCA_LEDGER_TABLE_BY_CLUSTER,
} from "../../lib/sheetSyncApi";
import { FUND_CLUSTER_OPTIONS, FundCluster } from "../../lib/ntcaApi";

const swalTheme = { background: "hsl(var(--background))", color: "hsl(var(--foreground))" };

// Each fund cluster's sources are managed the same way every other synced
// table's are (see SheetSyncManagerDialog / Received NTCA's own Sheet
// Setup) — a stackable label+URL list, not a single URL — since a cluster
// can legitimately span more than one spreadsheet (e.g. a prior year's
// archive plus the current one). This dialog only manages the list; the
// actual sync is the separate "Sync Sheets" button on the page, which needs
// its own client-side preview step (NtcaLedgerSheetSyncDialog) that the
// generic immediate-write "Sync Now" other tables use doesn't support.
export function CustomDisbursementSheetSetupDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sourcesByCluster, setSourcesByCluster] = useState<Partial<Record<FundCluster, SheetSyncSource[]>>>({});
  const [loadingByCluster, setLoadingByCluster] = useState<Partial<Record<FundCluster, boolean>>>({});

  const loadCluster = async (cluster: FundCluster) => {
    setLoadingByCluster((prev) => ({ ...prev, [cluster]: true }));
    try {
      const list = await sheetSyncApi.list(NTCA_LEDGER_TABLE_BY_CLUSTER[cluster]);
      setSourcesByCluster((prev) => ({ ...prev, [cluster]: list }));
    } finally {
      setLoadingByCluster((prev) => ({ ...prev, [cluster]: false }));
    }
  };

  useEffect(() => {
    if (!open) return;
    FUND_CLUSTER_OPTIONS.forEach((o) => loadCluster(o.value));
  }, [open]);

  const handleRemove = async (cluster: FundCluster, source: SheetSyncSource) => {
    const result = await Swal.fire({
      icon: "warning",
      title: `Remove "${source.label || "this sheet"}"?`,
      text: "This stops future syncing from this source. Records already imported are not deleted.",
      showCancelButton: true, confirmButtonText: "Remove", confirmButtonColor: "#dc2626", ...swalTheme,
    });
    if (!result.isConfirmed) return;
    await sheetSyncApi.remove(source.id);
    await loadCluster(cluster);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>Sheet Setup — Custom Disbursement</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Add Google Sheet URLs per fund cluster, then sync from the page's own "Sync Sheets" button. Every tab in
            each sheet (e.g. "MDS-REGULAR Jan2026", or a merged range like "MDS-REGULAR Jan2026-Feb2026") is picked
            up automatically — each row lands in whichever month its own Date column says, so tabs never need to be
            added one at a time, and a cluster isn't limited to just one spreadsheet.
          </p>
          {FUND_CLUSTER_OPTIONS.map((o, i) => (
            <div key={o.value} className="flex flex-col gap-3">
              {i > 0 && <div className="border-t border-border -mt-2" />}
              <SourceListSection
                label={o.label}
                sources={sourcesByCluster[o.value] ?? []}
                loading={loadingByCluster[o.value] ?? true}
                busy={false}
                onAdd={async (label, url) => {
                  await sheetSyncApi.create({
                    table: NTCA_LEDGER_TABLE_BY_CLUSTER[o.value], label, url,
                    order: (sourcesByCluster[o.value] ?? []).length,
                  });
                  await loadCluster(o.value);
                }}
                onRequestRemove={(source) => handleRemove(o.value, source)}
              />
            </div>
          ))}
        </div>
        <DialogFooter className="border-t border-border justify-end">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
