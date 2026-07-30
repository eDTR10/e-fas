import { useCallback, useState } from "react"

// Row-selection state shared by every admin list table's "select all" +
// bulk-delete UI. Selection persists across pages/filters on purpose (so a
// user can tick items on page 1, page 2, etc. before deleting) — only
// toggleAll is scoped to the ids you pass it (the current page).
export function useSelection<T extends number | string = number>() {
  const [selected, setSelected] = useState<Set<T>>(new Set())

  const toggle = useCallback((id: T) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback((ids: T[]) => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id))
      const next = new Set(prev)
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)))
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Set()), [])

  const isAllSelected = useCallback((ids: T[]) => ids.length > 0 && ids.every((id) => selected.has(id)), [selected])
  const isSomeSelected = useCallback((ids: T[]) => ids.some((id) => selected.has(id)), [selected])

  return { selected, toggle, toggleAll, clear, isAllSelected, isSomeSelected }
}
