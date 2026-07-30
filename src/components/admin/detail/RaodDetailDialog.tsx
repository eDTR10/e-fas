import { Badge } from "@/components/ui/badge"
import { RecordDetailDialog, type DetailField } from "@/components/ui/record-detail-dialog"
import type { SARO } from "@/lib/raodApi"
import { formatMoney, formatDate, toNumber } from "@/lib/formatters"

export function RaodDetailDialog({
  saro,
  open,
  onOpenChange,
}: {
  saro: SARO | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!saro) return null

  const allotment = toNumber(saro.amount_of_allotment)
  const obligated = toNumber(saro.obligated_amount)
  const disbursed = toNumber(saro.cash) + toNumber(saro.non_tra)
  const balance = toNumber(saro.balance)

  const obligationRate = allotment > 0 ? (obligated / allotment) * 100 : 0
  const disbursementRate = obligated > 0 ? (disbursed / obligated) * 100 : 0

  const fields: DetailField[] = [
    { label: "Date of SARO", value: formatDate(saro.date_of_saro) },
    { label: "Date of Obligation", value: formatDate(saro.date_of_obligation) },
    { label: "Disbursement Date", value: formatDate(saro.date) },
    { label: "Name of Claimant", value: saro.name_of_claimant },
    { label: "Object Code", value: saro.object_code },
    { label: "Object Description", value: saro.object_description },
    { label: "Fund Type Description", value: saro.fund_type_description },
    { label: "ADA/Check", value: saro.ada_check },
    { label: "Year", value: saro.year != null ? String(saro.year) : undefined },
    { label: "ORS No.", value: saro.ors_no },
    { label: "Purpose", value: saro.purpose, span: 2 },
    { label: "Particulars", value: saro.particulars, span: 2 },
    { label: "Remarks", value: saro.remarks, span: 2 },
  ]

  return (
    <RecordDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="RAOD Entry"
      title={saro.saro_no}
      subtitle={saro.pap || saro.object_description || undefined}
      chips={
        <>
          {saro.pap_code && <Badge variant="secondary">PAP {saro.pap_code}</Badge>}
          {saro.fund_source_detail && <Badge variant="outline">Fund: {saro.fund_source_detail.code}</Badge>}
          {saro.class_type_detail && <Badge variant="outline">Class: {saro.class_type_detail.code}</Badge>}
          {saro.ors_no && <Badge variant="outline">ORS {saro.ors_no}</Badge>}
          {saro.is_archived && <Badge variant="secondary">Archived</Badge>}
        </>
      }
      stats={[
        { label: "Amount of Allotment", value: formatMoney(saro.amount_of_allotment) },
        { label: "Obligated Amount", value: formatMoney(saro.obligated_amount) },
        { label: "Disbursed (Cash + Non-TRA)", value: formatMoney(disbursed) },
        { label: "Balance", value: formatMoney(saro.balance) },
      ]}
      progress={[
        {
          label: "Obligation Rate",
          percent: obligationRate,
          caption: `${formatMoney(obligated)} obligated of ${formatMoney(allotment)} allotted`,
          tone: obligationRate > 100 ? "critical" : "neutral",
        },
        {
          label: "Disbursement Rate",
          percent: disbursementRate,
          caption: `${formatMoney(disbursed)} disbursed of ${formatMoney(obligated)} obligated`,
          tone: disbursementRate > 100 ? "critical" : balance < 0 ? "warning" : "good",
        },
      ]}
      chartTitle="Fund Flow"
      chartData={[
        { stage: "Allotment", amount: allotment },
        { stage: "Obligated", amount: obligated },
        { stage: "Disbursed", amount: disbursed },
        { stage: "Balance", amount: balance },
      ]}
      chartXKey="stage"
      chartSeries={[{ key: "amount", name: "Amount" }]}
      fields={fields}
    />
  )
}
