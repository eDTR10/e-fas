import { Badge } from "@/components/ui/badge"
import { RecordDetailDialog, type DetailField } from "@/components/ui/record-detail-dialog"
import type { ReceivedSARO } from "@/lib/receivedSaroApi"
import { formatMoney, formatDate, toNumber } from "@/lib/formatters"

export function ReceivedSaroDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: ReceivedSARO | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!entry) return null

  const totalAmount = toNumber(entry.amount)
  const totalNca = entry.line_items.reduce((s, li) => s + toNumber(li.nca_amount), 0)
  const totalBalance = entry.line_items.reduce((s, li) => s + toNumber(li.balance), 0)
  const ncaUtilization = totalAmount > 0 ? (totalNca / totalAmount) * 100 : 0

  const fields: DetailField[] = [
    { label: "Date Received", value: formatDate(entry.date_received) },
    { label: "Date of SARO", value: formatDate(entry.date_of_saro) },
    { label: "Region", value: entry.region },
    { label: "Classification", value: entry.classification },
    { label: "Purpose", value: entry.particulars, span: 2 },
    { label: "Notes / Validity", value: entry.validity_notes, span: 2 },
  ]

  return (
    <RecordDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Received SARO"
      title={entry.saro_no}
      subtitle={entry.pap_name || undefined}
      chips={
        <>
          {entry.pap_code && <Badge variant="secondary">PAP {entry.pap_code}</Badge>}
          {entry.fund_type && <Badge variant="outline">{entry.fund_type}</Badge>}
          {entry.class_type_label && <Badge variant="outline">{entry.class_type_label}</Badge>}
          {entry.region && <Badge variant="outline">{entry.region}</Badge>}
          {entry.is_archived && <Badge variant="secondary">Archived</Badge>}
        </>
      }
      stats={[
        { label: "Total Allotment", value: formatMoney(entry.amount) },
        { label: "Total NCA Received", value: formatMoney(totalNca) },
        { label: "Remaining Balance", value: formatMoney(totalBalance) },
        { label: "Line Items", value: String(entry.line_items.length) },
      ]}
      progress={[
        {
          label: "NCA Utilization",
          percent: ncaUtilization,
          caption: `${formatMoney(totalNca)} released of ${formatMoney(totalAmount)} total allotment`,
          tone: ncaUtilization > 100 ? "critical" : ncaUtilization >= 90 ? "good" : ncaUtilization >= 40 ? "warning" : "neutral",
        },
      ]}
      chartTitle="Object Code Breakdown"
      chartData={
        entry.line_items.length >= 2
          ? entry.line_items.map((li) => ({
              code: li.object_code || "—",
              amount: toNumber(li.amount),
              nca: toNumber(li.nca_amount),
            }))
          : undefined
      }
      chartXKey="code"
      chartSeries={[
        { key: "amount", name: "Amount" },
        { key: "nca", name: "NCA Received" },
      ]}
      fields={fields}
    />
  )
}
