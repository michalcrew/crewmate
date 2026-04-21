import Link from "next/link"
import { Clock, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getMyHodinyThisMonth } from "@/lib/actions/naborar-hodiny"
import { formatMinutes } from "@/lib/utils/minutes"

/**
 * F-0019 — Moje hodiny tento měsíc (náborářka hero card).
 * Server component — fetchne `getMyHodinyThisMonth()`, zobrazí sum + top 3
 * zakázky breakdown + link na plný přehled.
 *
 * Jméno komponenty zachováno (`MojeHodinyPlaceholderCard`) kvůli stabilitě
 * importu v `app/(app)/app/page.tsx` (dashboard). Ostatní importy (F-0017)
 * zůstávají funkční.
 */
export async function MojeHodinyPlaceholderCard() {
  const { total_minut, breakdown } = await getMyHodinyThisMonth()
  const now = new Date()
  const mesicLabel = now.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })
  const top3 = breakdown.slice(0, 3)

  return (
    <Card className="shadow-sm min-h-[180px]">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Moje hodiny tento měsíc</CardTitle>
        </div>
        <Link
          href="/app/hodiny?view=moje"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Zobrazit všechny
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {total_minut === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Ještě nemáš žádné záznamy za {mesicLabel}
            </p>
            <Link
              href="/app/hodiny?view=moje"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Zapsat první hodiny
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-3xl font-bold">{formatMinutes(total_minut)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{mesicLabel}</p>
            </div>
            {top3.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top zakázky</p>
                {top3.map((b) => (
                  <div key={b.nabidka_id ?? "__ostatni__"} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate min-w-0 flex items-center gap-2">
                      {b.nabidka_id === null && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Ostatní</Badge>
                      )}
                      <span className="truncate">{b.nazev}</span>
                    </span>
                    <span className="font-medium shrink-0">{formatMinutes(b.minut)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
