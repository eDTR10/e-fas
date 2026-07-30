import { Badge, badgeVariants } from "./badge";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

type ChipColor = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// Every distinct value of a categorical column (Fund Type, Fund Cluster,
// Class Type, Role, ...) gets a color from this rotation, picked
// deterministically by hashing the label — so the same value always renders
// the same color everywhere it appears, without hand-maintaining a mapping
// per page. "default"/"secondary"/"success"/"warning"/"destructive" are left
// out of the rotation since those already carry a fixed semantic meaning
// (active/archived/paid/etc.) elsewhere in these tables.
const ROTATION: ChipColor[] = [
  "blue", "purple", "teal", "orange", "pink", "indigo", "amber", "cyan", "rose", "slate",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function colorForCategory(label: string): ChipColor {
  if (!label) return "secondary";
  return ROTATION[hashString(label) % ROTATION.length];
}

export function CategoryChip({ label, className }: { label: string | null | undefined; className?: string }) {
  const text = label?.trim();
  if (!text) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={colorForCategory(text)} className={cn("truncate max-w-full", className)}>
      {text}
    </Badge>
  );
}
