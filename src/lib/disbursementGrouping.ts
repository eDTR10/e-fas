import type { Disbursement } from "@/lib/disbursementApi"
import { toNumber } from "@/lib/formatters"

// A single DV can carry several ORS No. lines (one per PAP/object-code
// split of the same payment) — grouped here purely for display (accordion
// + group summary), the same way RAOD groups its own object-code entries
// by SARO No. (see raodGrouping.ts).
export interface DisbursementGroup {
  key: string
  dv_number: string
  routing_slip_no: string
  date: string | null
  fund_source: string
  name_of_claimant: string
  entries: Disbursement[]
  totalAmount: number
  totalGross: number
  totalNet: number
  date_paid: string | null
  ada_check: string
  nca: string | null
  isPaid: boolean
}

export function groupDisbursements(entries: Disbursement[]): DisbursementGroup[] {
  const order: string[] = []
  const map = new Map<string, Disbursement[]>()
  entries.forEach((d) => {
    const key = d.dv_number?.trim() ? d.dv_number.trim() : `__none_${d.id}`
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key)!.push(d)
  })

  return order.map((key) => {
    const list = map.get(key)!
    const first = list[0]
    // Amount is a whole-DV value, but Net may be a real per-ORS breakdown
    // in the source tracker. Sum imported Net lines so the KPI agrees with
    // the spreadsheet's Net column instead of discarding all but one line.
    const datePaidRow = list.find((d) => !!d.date_paid)
    const adaCheckRow = list.find((d) => !!d.ada_check)
    const ncaRow = list.find((d) => d.nca !== null && d.nca !== "")
    return {
      key,
      dv_number: first.dv_number,
      routing_slip_no: first.routing_slip_no,
      date: first.date,
      fund_source: first.fund_source,
      name_of_claimant: first.name_of_claimant,
      entries: list,
      // Amount is a whole-DV total the sheet shows repeated on every ORS
      // split line (a merged cell, visually), not a per-ORS figure — so
      // it's taken once per DV, not summed across splits, unlike Gross
      // (which genuinely is a real per-ORS breakdown that sums back up to
      // the whole).
      totalAmount: toNumber(first.amount),
      totalGross: list.reduce((s, x) => s + toNumber(x.gross), 0),
      totalNet: list.reduce((s, x) => s + toNumber(x.net), 0),
      date_paid: datePaidRow?.date_paid ?? null,
      ada_check: adaCheckRow?.ada_check ?? "",
      nca: ncaRow?.nca ?? null,
      isPaid: !!datePaidRow,
    }
  })
}

// One level up from groupDisbursements — a single Routing Slip No. can
// cover several DVs at once (not just several ORS lines within one DV), so
// this buckets the DV-level groups by routing_slip_no the same way
// groupDisbursements buckets raw entries by dv_number. Renders as the
// outer accordion: Routing Slip → DV → ORS line.
export interface RoutingSlipGroup {
  key: string
  routing_slip_no: string
  dvGroups: DisbursementGroup[]
  totalAmount: number
  totalGross: number
  allPaid: boolean
}

export function groupDisbursementGroupsByRoutingSlip(dvGroups: DisbursementGroup[]): RoutingSlipGroup[] {
  const order: string[] = []
  const map = new Map<string, RoutingSlipGroup>()

  dvGroups.forEach((g) => {
    const key = g.routing_slip_no?.trim() ? g.routing_slip_no.trim() : `__none_${g.key}`
    let group = map.get(key)
    if (!group) {
      group = {
        key, routing_slip_no: g.routing_slip_no, dvGroups: [],
        totalAmount: 0, totalGross: 0, allPaid: true,
      }
      map.set(key, group)
      order.push(key)
    }
    group.dvGroups.push(g)
    group.totalAmount += g.totalAmount
    group.totalGross += g.totalGross
    if (!g.isPaid) group.allPaid = false
  })

  return order.map((key) => map.get(key)!)
}
