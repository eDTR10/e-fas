import { cn } from "@/lib/utils"

export type ProgressTone = "good" | "warning" | "critical" | "neutral"

const TONE_BAR_CLASSES: Record<ProgressTone, string> = {
  good: "bg-green-500",
  warning: "bg-yellow-500",
  critical: "bg-red-500",
  neutral: "bg-primary",
}

const TONE_TEXT_CLASSES: Record<ProgressTone, string> = {
  good: "text-green-600 dark:text-green-400",
  warning: "text-yellow-600 dark:text-yellow-400",
  critical: "text-red-600 dark:text-red-400",
  neutral: "text-muted-foreground",
}

export function ProgressBar({
  label,
  percent,
  caption,
  tone = "neutral",
  className,
}: {
  label: string
  /** 0-100+; values outside 0-100 are clamped for the bar fill but shown as-is in the percent label */
  percent: number
  caption?: string
  tone?: ProgressTone
  className?: string
}) {
  const clamped = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="font-medium text-foreground">{label}</span>
        <span className={cn("font-semibold shrink-0", TONE_TEXT_CLASSES[tone])}>
          {Number.isFinite(percent) ? `${percent.toFixed(1)}%` : "—"}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", TONE_BAR_CLASSES[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {caption && <p className="text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  )
}
