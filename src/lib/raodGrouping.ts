import type { SARO } from "@/lib/raodApi"
import { toNumber } from "@/lib/formatters"

// RAOD (SARO) records aren't linked to each other server-side — multiple
// object-code entries can share the same SARO No. as independent rows. This
// groups them client-side purely for display (accordion + group summary).
export interface RaodGroup {
  key: string
  saro_no: string
  date_of_saro: string | null
  pap: string
  pap_code: string
  entries: SARO[]
  totalAllotment: number
  totalObligated: number
  totalDisbursed: number
  totalBalance: number
  allArchived: boolean
}

export interface ObjectCodeBreakdownRow {
  object_code: string
  object_description: string
  amount_of_allotment: number
  obligated_amount: number
  balance: number
  // The raw records this row summarizes — kept around so a merged row can
  // still expand to its individual entries for editing (see RaodPage.tsx's
  // nested sub-expand).
  entries: SARO[]
}

// A single SARO No. can carry the same UACS/Object Code across several rows
// (e.g. one obligation entry per transaction over time) — this collapses
// those into one row per Object Code, summing the obligated amount (and the
// other money columns alongside it) instead of listing each raw row.
export function groupEntriesByObjectCode(entries: SARO[]): ObjectCodeBreakdownRow[] {
  const order: string[] = []
  const map = new Map<string, ObjectCodeBreakdownRow>()

  entries.forEach((e) => {
    const code = e.object_code?.trim() || "—"
    let row = map.get(code)
    if (!row) {
      row = { object_code: code, object_description: e.object_description || "", amount_of_allotment: 0, obligated_amount: 0, balance: 0, entries: [] }
      map.set(code, row)
      order.push(code)
    }
    if (!row.object_description && e.object_description) row.object_description = e.object_description
    row.amount_of_allotment += toNumber(e.amount_of_allotment)
    row.obligated_amount += toNumber(e.obligated_amount)
    row.entries.push(e)
  })

  // Balance is the unobligated portion of the allotment, not the raw
  // per-row `balance` field (which tracks disbursement, not obligation).
  order.forEach((code) => {
    const row = map.get(code)!
    row.balance = row.amount_of_allotment - row.obligated_amount
  })

  return order.map((code) => map.get(code)!)
}

// One level up from groupRaodEntries — buckets those SARO-No. groups by
// PAP/Project (pap_code, falling back to the free-text PAP name, then an
// "(no PAP)" bucket) so the page can render PAP as the outer accordion and
// SARO No. as the level nested inside it.
export interface PapGroup {
  key: string
  pap: string
  pap_code: string
  saroGroups: RaodGroup[]
  totalAllotment: number
  totalObligated: number
  totalDisbursed: number
  totalBalance: number
  allArchived: boolean
}

export function groupRaodGroupsByPap(saroGroups: RaodGroup[]): PapGroup[] {
  const order: string[] = []
  const map = new Map<string, PapGroup>()

  saroGroups.forEach((g) => {
    const key = g.pap_code?.trim() || (g.pap?.trim() ? `__pap_${g.pap.trim()}` : "__none_pap")
    let group = map.get(key)
    if (!group) {
      group = {
        key, pap: g.pap, pap_code: g.pap_code, saroGroups: [],
        totalAllotment: 0, totalObligated: 0, totalDisbursed: 0, totalBalance: 0, allArchived: true,
      }
      map.set(key, group)
      order.push(key)
    }
    if (!group.pap && g.pap) group.pap = g.pap
    if (!group.pap_code && g.pap_code) group.pap_code = g.pap_code
    group.saroGroups.push(g)
    group.totalAllotment += g.totalAllotment
    group.totalObligated += g.totalObligated
    group.totalDisbursed += g.totalDisbursed
    group.totalBalance += g.totalBalance
    if (!g.allArchived) group.allArchived = false
  })

  return order.map((key) => map.get(key)!)
}

export function groupRaodEntries(entries: SARO[]): RaodGroup[] {
  const order: string[] = []
  const map = new Map<string, SARO[]>()
  entries.forEach((s) => {
    const key = s.saro_no?.trim() ? s.saro_no.trim() : `__none_${s.id}`
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key)!.push(s)
  })

  return order.map((key) => {
    const list = map.get(key)!
    const first = list[0]
    const totalAllotment = list.reduce((s, x) => s + toNumber(x.amount_of_allotment), 0)
    const totalObligated = list.reduce((s, x) => s + toNumber(x.obligated_amount), 0)
    return {
      key,
      saro_no: first.saro_no,
      date_of_saro: first.date_of_saro,
      pap: first.pap,
      pap_code: first.pap_code,
      entries: list,
      totalAllotment,
      totalObligated,
      totalDisbursed: list.reduce((s, x) => s + toNumber(x.cash) + toNumber(x.non_tra), 0),
      // Balance is the unobligated portion of the allotment (Allotment −
      // Obligated), not a sum of the raw per-row `balance` field.
      totalBalance: totalAllotment - totalObligated,
      allArchived: list.every((x) => x.is_archived),
    }
  })
}
