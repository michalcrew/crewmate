import Link from "next/link"
import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { DashboardAlert } from "@/lib/actions/dashboard"

/**
 * F-0017 US-1B — „Vyžaduje pozornost" alerts list.
 *
 * - Red pro urgent (`dpp_tento_tyden`), amber pro ostatní.
 * - Klik → filtered list view (href z BE).
 * - Empty state „Vše v pořádku" pokud žádný alert.
 *
 * BE vrací jen alerts s `count > 0` (plus urgentní na začátku seznamu).
 */

interface Props {
  alerts: DashboardAlert[]
  className?: string
}

function pluralBrigadnik(n: number): string {
  if (n === 1) return "brigádník"
  if (n >= 2 && n <= 4) return "brigádníci"
  return "brigádníků"
}

export function DashboardAlerty({ alerts, className }: Props) {
  if (alerts.length === 0) {
    return (
      <Card className={cn("shadow-sm bg-green-50/30 border-green-200", className)}>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Vše v pořádku</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Vyžaduje pozornost
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {alerts.map((a) => {
            const Icon = a.urgent ? AlertCircle : AlertTriangle
            return (
              <Link
                key={a.key}
                href={a.href}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border-l-4 px-3 py-2 transition-colors",
                  a.urgent
                    ? "border-red-400 bg-red-50/60 hover:bg-red-50"
                    : "border-amber-300 bg-amber-50/40 hover:bg-amber-50"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      a.urgent ? "text-red-500" : "text-amber-500"
                    )}
                  />
                  <span className="text-sm truncate">
                    <span className="font-semibold tabular-nums">{a.count}</span>{" "}
                    {pluralBrigadnik(a.count)} · {a.label}
                  </span>
                </div>
                <span className="text-xs font-medium text-primary hover:underline shrink-0">
                  Zobrazit
                </span>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
