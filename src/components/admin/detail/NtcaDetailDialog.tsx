import { Link2, Link2Off } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { RecordDetailDialog, type DetailField } from "@/components/ui/record-detail-dialog"
import { FUND_CLUSTER_OPTIONS, type NTCA } from "@/lib/ntcaApi"
import type { ReceivedSARO } from "@/lib/receivedSaroApi"
import { formatMoney, formatDate, toNumber } from "@/lib/formatters"

export function NtcaDetailDialog({
  ntca,
  matchedSaro,
  open,
  onOpenChange,
}: {
  ntca: NTCA | null
  matchedSaro?: ReceivedSARO
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!ntca) return null

  const amount = toNumber(ntca.amount)
  const remaining = toNumber(ntca.remaining_balance)
  const drawn = amount - remaining
  const drawnRate = amount > 0 ? (drawn / amount) * 100 : 0
  const fundClusterLabel = FUND_CLUSTER_OPTIONS.find((o) => o.value === ntca.fund_cluster)?.label

  const fields: DetailField[] = [
    { label: "Date of NTCA", value: formatDate(ntca.date_of_ntca) },
    { label: "SARO No.", value: ntca.saro_no },
    { label: "SARO Year", value: ntca.saro_year != null ? String(ntca.saro_year) : undefined },
    { label: "Year", value: ntca.year != null ? String(ntca.year) : undefined },
    { label: "PAP Code", value: ntca.pap_code },
    { label: "NCA No.", value: ntca.nca_no },
    { label: "Purpose", value: ntca.purpose, span: 2 },
    { label: "Particulars", value: ntca.particulars, span: 2 },
    { label: "Remarks", value: ntca.remarks, span: 2 },
  ]

  return (
    <RecordDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="NTCA Received"
      title={ntca.ntca_no}
      subtitle={ntca.particulars || undefined}
      chips={
        <>
          {ntca.pap_code && <Badge variant="secondary">PAP {ntca.pap_code}</Badge>}
          {fundClusterLabel && <Badge variant="outline">{fundClusterLabel}</Badge>}
          {ntca.saro_no && (
            matchedSaro ? (
              <Badge variant="success"><Link2 className="w-3 h-3" /> Linked to {ntca.saro_no}</Badge>
            ) : (
              <Badge variant="secondary"><Link2Off className="w-3 h-3" /> Unlinked ({ntca.saro_no})</Badge>
            )
          )}
          {ntca.is_archived && <Badge variant="secondary">Archived</Badge>}
        </>
      }
      stats={[
        { label: "NTCA Amount", value: formatMoney(ntca.amount) },
        { label: "Drawn", value: formatMoney(drawn) },
        { label: "Remaining Balance", value: formatMoney(ntca.remaining_balance) },
      ]}
      progress={[
        {
          label: "Drawn Against NTCA",
          percent: drawnRate,
          caption: `${formatMoney(drawn)} drawn of ${formatMoney(amount)} received`,
          tone: drawnRate > 100 ? "critical" : drawnRate >= 90 ? "warning" : "good",
        },
      ]}
      chartTitle="Cash Allocation Flow"
      chartData={[
        { stage: "NTCA Amount", amount },
        { stage: "Drawn", amount: drawn },
        { stage: "Remaining", amount: remaining },
      ]}
      chartXKey="stage"
      chartSeries={[{ key: "amount", name: "Amount" }]}
      fields={fields}
    />
  )
}
