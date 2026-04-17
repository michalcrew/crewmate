import { Badge } from "@/components/ui/badge"
import { NABIDKA_TYPY, type NabidkaTyp } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function TypBadge({ typ, className }: { typ: string; className?: string }) {
  const config = NABIDKA_TYPY[typ as NabidkaTyp]
  if (!config) return <Badge variant="outline">{typ}</Badge>
  return (
    <Badge variant="outline" className={cn(config.color, "text-xs border", className)}>
      {config.label}
    </Badge>
  )
}
