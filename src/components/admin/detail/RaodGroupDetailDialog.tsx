import { Badge } from "@/components/ui/badge"
import { RecordDetailDialog, type DetailField } from "@/components/ui/record-detail-dialog"
import { groupEntriesByObjectCode, type RaodGroup } from "@/lib/raodGrouping"
import { formatMoney, formatDate } from "@/lib/formatters"

export function RaodGroupDetailDialog({
  group,
  open,
  onOpenChange,
}: {
  group: RaodGroup | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!group) return null

  const obligationRate = group.totalAllotment > 0 ? (group.totalObligated / group.totalAllotment) * 100 : 0
  const disbursementRate = group.totalObligated > 0 ? (group.totalDisbursed / group.totalObligated) * 100 : 0

  // One row per distinct UACS/Object Code — a code can repeat across several
  // raw entries (e.g. separate obligation transactions), so this sums the
  // obligated amount (and allotment/balance alongside it) per code instead
  // of listing every raw row.
  const byObjectCode = groupEntriesByObjectCode(group.entries)

  const fields: DetailField[] = [
    { label: "Date of SARO", value: formatDate(group.date_of_saro) },
    { label: "Object Codes", value: String(byObjectCode.length) },
  ]

  return (
    <RecordDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="RAOD Group"
      title={group.saro_no || "(no SARO No.)"}
      subtitle={group.pap || undefined}
      chips={
        <>
          {group.pap_code && <Badge variant="secondary">PAP {group.pap_code}</Badge>}
          <Badge variant="outline">{byObjectCode.length} object code{byObjectCode.length === 1 ? "" : "s"}</Badge>
          {group.allArchived && <Badge variant="secondary">Archived</Badge>}
        </>
      }
      stats={[
        { label: "Total Allotment", value: formatMoney(group.totalAllotment) },
        { label: "Total Obligated", value: formatMoney(group.totalObligated) },
        { label: "Total Disbursed", value: formatMoney(group.totalDisbursed) },
        { label: "Total Balance", value: formatMoney(group.totalBalance) },
      ]}
      progress={[
        {
          label: "Obligation Rate",
          percent: obligationRate,
          caption: `${formatMoney(group.totalObligated)} obligated of ${formatMoney(group.totalAllotment)} allotted`,
          tone: obligationRate > 100 ? "critical" : "neutral",
        },
        {
          label: "Disbursement Rate",
          percent: disbursementRate,
          caption: `${formatMoney(group.totalDisbursed)} disbursed of ${formatMoney(group.totalObligated)} obligated`,
          tone: disbursementRate > 100 ? "critical" : group.totalBalance < 0 ? "warning" : "good",
        },
      ]}
      chartTitle="Amount by Object Code"
      chartData={
        byObjectCode.length >= 2
          ? byObjectCode.map((r) => ({
              code: r.object_code,
              allotment: r.amount_of_allotment,
              obligated: r.obligated_amount,
            }))
          : undefined
      }
      chartXKey="code"
      chartSeries={[
        { key: "allotment", name: "Amount of Allotment" },
        { key: "obligated", name: "Obligated Amount" },
      ]}
      extra={
        <div>
          <p className="text-xs font-semibold text-foreground mb-2">Object Code Breakdown</p>
          <div className="overflow-x-auto border border-border rounded-lg">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[100px_1.5fr_120px_120px_120px] gap-2 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Object Code</span>
                <span>Description</span>
                <span>Allotment</span>
                <span>Obligated</span>
                <span>Balance</span>
              </div>
              {byObjectCode.map((r) => (
                <div key={r.object_code} className="grid grid-cols-[100px_1.5fr_120px_120px_120px] gap-2 px-3 py-2 border-b border-border last:border-0 text-xs">
                  <span className="text-foreground">{r.object_code}</span>
                  <span className="text-foreground truncate">{r.object_description || "—"}</span>
                  <span className="text-foreground">{formatMoney(r.amount_of_allotment)}</span>
                  <span className="text-foreground">{formatMoney(r.obligated_amount)}</span>
                  <span className="text-foreground">{formatMoney(r.balance)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
      fields={fields}
    />
  )
}
