import { Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * F-0017 US-1D-2 — placeholder pro „Moje hodiny tento měsíc" (náborářka only).
 *
 * Real data přijdou v F-0019 (naborar_hodiny). Fixed min-height aby po swapu
 * neskakal layout (architect §6 FE-4).
 */

export function MojeHodinyPlaceholderCard() {
  return (
    <Card className="shadow-sm min-h-[180px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Moje hodiny tento měsíc</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-6 text-center opacity-60">
          <Clock className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            K dispozici po F-0019
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Přehled odpracovaných hodin náborářky
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
