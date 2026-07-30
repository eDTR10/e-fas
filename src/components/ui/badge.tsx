import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium w-fit whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        secondary: "border-transparent bg-muted text-muted-foreground",
        success: "border-transparent bg-green-500/10 text-green-600 dark:text-green-400",
        warning: "border-transparent bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        outline: "border-border text-foreground",
        blue: "border-transparent bg-blue-500/10 text-blue-600 dark:text-blue-400",
        indigo: "border-transparent bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
        purple: "border-transparent bg-purple-500/10 text-purple-600 dark:text-purple-400",
        pink: "border-transparent bg-pink-500/10 text-pink-600 dark:text-pink-400",
        rose: "border-transparent bg-rose-500/10 text-rose-600 dark:text-rose-400",
        orange: "border-transparent bg-orange-500/10 text-orange-600 dark:text-orange-400",
        amber: "border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400",
        teal: "border-transparent bg-teal-500/10 text-teal-600 dark:text-teal-400",
        cyan: "border-transparent bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
        slate: "border-transparent bg-slate-500/10 text-slate-600 dark:text-slate-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
