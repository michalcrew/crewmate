import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { ArrowUp, ArrowDown, type LucideIcon } from "lucide-react"

interface StatsCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  trend?: number
  trendLabel?: string
  className?: string
}

export function StatsCard({ icon: Icon, label, value, trend, trendLabel, className }: StatsCardProps) {
  return (
    <Card className={cn("shadow-sm", className)}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-sm">{label}</span>
        </div>
        <div className="flex items-end gap-2">
          <p className="text-3xl font-bold tabular-nums tracking-tight">{value}</p>
          {trend !== undefined && trend !== 0 && (
            <span className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium mb-1",
              trend > 0 ? "text-green-600" : "text-red-500"
            )}>
              {trend > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(trend)}
              {trendLabel && <span className="text-muted-foreground font-normal ml-0.5">{trendLabel}</span>}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
