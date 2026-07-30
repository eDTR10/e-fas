import type { ReactNode } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ProgressBar, type ProgressTone } from "@/components/ui/progress-bar"
import { MiniLineChart, type MiniLineSeries } from "@/components/charts/MiniLineChart"

export interface DetailStat {
  label: string
  value: string
}

export interface DetailProgress {
  label: string
  percent: number
  caption?: string
  tone?: ProgressTone
}

export interface DetailField {
  label: string
  value: ReactNode
  span?: 2
}

export function RecordDetailDialog({
  open,
  onOpenChange,
  eyebrow,
  title,
  subtitle,
  chips,
  stats,
  progress,
  extra,
  chartTitle,
  chartData,
  chartXKey,
  chartSeries,
  fields,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eyebrow: string
  title: string
  subtitle?: string
  chips?: ReactNode
  stats: DetailStat[]
  progress?: DetailProgress[]
  /** Slot for a bespoke indicator (e.g. a pipeline step tracker) that doesn't fit the percent-bar shape. */
  extra?: ReactNode
  chartTitle?: string
  chartData?: Record<string, string | number>[]
  chartXKey?: string
  chartSeries?: MiniLineSeries[]
  fields: DetailField[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="border-b border-border">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{eyebrow}</p>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          {chips && <div className="flex flex-wrap gap-1.5 mt-3">{chips}</div>}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          {stats.length > 0 && (
            <div className={stats.length >= 4 ? "grid grid-cols-4 gap-3 sm:grid-cols-2" : "grid grid-cols-3 gap-3 sm:grid-cols-2"}>
              {stats.map((s) => (
                <div key={s.label} className="bg-muted/40 border border-border rounded-lg p-3 flex flex-col gap-1 min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground truncate">{s.label}</p>
                  <p className="text-base font-semibold text-foreground truncate">{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {progress && progress.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-1">
              {progress.map((p) => (
                <ProgressBar key={p.label} label={p.label} percent={p.percent} caption={p.caption} tone={p.tone} />
              ))}
            </div>
          )}

          {extra}

          {chartData && chartXKey && chartSeries && (
            <div>
              {chartTitle && <p className="text-xs font-semibold text-foreground mb-2">{chartTitle}</p>}
              <MiniLineChart data={chartData} xKey={chartXKey} series={chartSeries} />
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Details</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-1 border border-border rounded-lg p-4 bg-muted/20">
              {fields.map((f, i) => (
                <div key={i} className={f.span === 2 ? "col-span-2 min-w-0" : "min-w-0"}>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{f.label}</p>
                  <p className="text-sm text-foreground mt-0.5 break-words">{f.value ?? "—"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border justify-end">
          <Button variant="outline" className="text-foreground" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
