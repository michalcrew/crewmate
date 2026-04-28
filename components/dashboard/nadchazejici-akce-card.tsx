import Link from "next/link"
import { Calendar, UserCog, HardHat } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { NadchazejiciAkce } from "@/lib/actions/dashboard"

/**
 * F-0017 US-1A-1 — sloučená karta „Nadcházející akce + obsazenost".
 * NAHRAZUJE inline „Obsazenost akcí" + „Blížící se akce" dvojblok v `app/page.tsx`.
 *
 * - Table layout ≥640px, vertical stack <640px.
 * - Urgent row (datum ≤3 dny) = amber background.
 * - Progress bar + „N/M" badge pro obsazenost.
 */

interface Props {
  akce: NadchazejiciAkce[]
  className?: string
}

function urgentLabel(badge?: NadchazejiciAkce["urgentBadge"]): string | null {
  if (badge === "dnes") return "Dnes"
  if (badge === "zitra") return "Zítra"
  if (badge === "za_3_dny") return "Za 3 dny"
  return null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export function NadchazejiciAkceCard({ akce, className }: Props) {
  return (
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Nadcházející akce</CardTitle>
          <Link
            href="/app/akce"
            className="text-xs text-primary hover:underline"
          >
            Zobrazit vše
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {akce.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              Žádné nadcházející akce
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {akce.map((a) => {
              const targetBrig = a.pocet_brigadniku ?? 0
              const targetKoord = a.pocet_koordinatoru ?? 0
              const brigPct = targetBrig > 0 ? Math.min(100, Math.round((a.obsazeno_brig / targetBrig) * 100)) : 0
              const koordPct = targetKoord > 0 ? Math.min(100, Math.round((a.obsazeno_koord / targetKoord) * 100)) : 0
              const brigColor = brigPct >= 100 ? "bg-green-500" : brigPct >= 50 ? "bg-amber-400" : "bg-red-400"
              const koordColor = koordPct >= 100 ? "bg-green-500" : koordPct >= 50 ? "bg-amber-400" : "bg-red-400"
              const urgent = urgentLabel(a.urgentBadge)
              const hasKoord = targetKoord > 0
              return (
                <Link
                  key={a.id}
                  href={`/app/akce/${a.id}`}
                  className={cn(
                    "flex flex-col gap-1.5 py-2.5 px-2 -mx-2 rounded-lg transition-colors hover:bg-muted sm:flex-row sm:items-center sm:gap-3",
                    urgent && "bg-amber-50/50 border-l-2 border-amber-400"
                  )}
                >
                  <div className="flex items-center gap-2 sm:w-24 shrink-0">
                    <span className="text-xs font-medium tabular-nums">
                      {formatDate(a.datum)}
                    </span>
                    {urgent && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 border-amber-400 text-amber-700 bg-amber-50 px-1.5"
                      >
                        {urgent}
                      </Badge>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{a.nazev}</p>
                    {(a.misto || a.cas_od) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {a.cas_od && a.cas_od.slice(0, 5)}
                        {a.cas_od && a.misto && " · "}
                        {a.misto}
                      </p>
                    )}
                  </div>

                  {/* Dva mini progress bary: koord (jen pokud > 0) + brig */}
                  <div className="flex flex-col gap-1 sm:w-44 shrink-0">
                    {hasKoord && (
                      <div className="flex items-center gap-1.5" title="Koordinátoři: obsazeno / plán">
                        <UserCog className="h-3 w-3 text-blue-600 shrink-0" />
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", koordColor)}
                            style={{ width: `${koordPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] tabular-nums text-muted-foreground shrink-0 w-8 text-right">
                          {a.obsazeno_koord}/{targetKoord}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5" title="Brigádníci: obsazeno / plán">
                      <HardHat className="h-3 w-3 text-amber-600 shrink-0" />
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        {targetBrig > 0 && (
                          <div
                            className={cn("h-full rounded-full transition-all", brigColor)}
                            style={{ width: `${brigPct}%` }}
                          />
                        )}
                      </div>
                      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0 w-8 text-right">
                        {a.obsazeno_brig}{targetBrig > 0 ? `/${targetBrig}` : ""}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
