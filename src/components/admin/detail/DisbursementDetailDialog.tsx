import { Badge } from "@/components/ui/badge"
import { RecordDetailDialog, type DetailField } from "@/components/ui/record-detail-dialog"
import type { Disbursement } from "@/lib/disbursementApi"
import { formatMoney, formatDate, toNumber } from "@/lib/formatters"

export function DisbursementDetailDialog({
  disbursement,
  open,
  onOpenChange,
}: {
  disbursement: Disbursement | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!disbursement) return null

  const amount = toNumber(disbursement.amount)
  const gross = toNumber(disbursement.gross)
  const net = toNumber(disbursement.net)
  const netOfGross = gross > 0 ? (net / gross) * 100 : 0
  const paidDone = !!disbursement.date_paid

  const fields: DetailField[] = [
    { label: "Routing Slip No.", value: disbursement.routing_slip_no },
    { label: "Date", value: formatDate(disbursement.date) },
    { label: "Time Received / Time Process", value: disbursement.time_received },
    { label: "Fund Source", value: disbursement.fund_source },
    { label: "ORS No.", value: disbursement.ors_no },
    { label: "Date Paid", value: formatDate(disbursement.date_paid) },
    { label: "ADA/Check", value: disbursement.ada_check },
    { label: "NCA", value: disbursement.nca !== null ? formatMoney(disbursement.nca) : undefined },
    { label: "Particulars", value: disbursement.particulars, span: 2 },
  ]

  return (
    <RecordDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Disbursement Voucher"
      title={disbursement.dv_number || "(no DV No.)"}
      subtitle={disbursement.name_of_claimant || undefined}
      chips={
        <>
          {disbursement.fund_source && <Badge variant="outline">{disbursement.fund_source}</Badge>}
          {paidDone && <Badge variant="success">Paid</Badge>}
        </>
      }
      stats={[
        { label: "Amount", value: formatMoney(disbursement.amount) },
        { label: "Gross (from RAOD)", value: disbursement.gross !== null ? formatMoney(disbursement.gross) : "—" },
        { label: "Net", value: disbursement.net !== null ? formatMoney(disbursement.net) : "—" },
      ]}
      progress={
        gross > 0 && net > 0
          ? [{
              label: "Net of Gross",
              percent: netOfGross,
              caption: `${formatMoney(net)} net of ${formatMoney(gross)} gross`,
              tone: netOfGross >= 90 ? "good" : netOfGross >= 70 ? "warning" : "critical",
            }]
          : undefined
      }
      chartTitle={gross > 0 || amount > 0 ? "Amount Breakdown" : undefined}
      chartData={
        gross > 0
          ? [
              { stage: "Gross", value: gross },
              { stage: "Net", value: net },
            ]
          : undefined
      }
      chartXKey="stage"
      chartSeries={[{ key: "value", name: "Amount" }]}
      fields={fields}
    />
  )
}
