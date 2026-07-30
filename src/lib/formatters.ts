export const formatMoney = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "—"
  const n = Number(value)
  if (Number.isNaN(n)) return "—"
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—"
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

export const toNumber = (value: string | number | null | undefined): number => {
  const n = Number(value)
  return Number.isNaN(n) ? 0 : n
}

export const compactNumber = (n: number): string => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toFixed(0)
}
