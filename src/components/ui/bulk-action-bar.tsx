import { Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export function BulkActionBar({
  count,
  itemLabel = "item",
  onDelete,
  onClear,
  extraActions,
}: {
  count: number
  itemLabel?: string
  onDelete: () => void
  onClear: () => void
  // Extra controls (e.g. a "set fund cluster" dropdown) rendered before
  // Clear/Delete — for bulk actions beyond delete that a given page needs.
  extraActions?: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5">
      <span className="text-sm font-medium text-foreground">
        {count} {itemLabel}{count === 1 ? "" : "s"} selected
      </span>
      <div className="flex items-center gap-2 ml-auto">
        {extraActions}
        <Button variant="outline" size="sm" className="text-foreground" onClick={onClear}>
          <X className="w-3.5 h-3.5 mr-1.5" /> Clear
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Selected
        </Button>
      </div>
    </div>
  )
}
