import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, ArrowRight } from "lucide-react"
import {
  getMyHodiny,
  getAllHodiny,
  getActiveNabidkyForPicker,
  type HodinyRowWithMeta,
} from "@/lib/actions/naborar-hodiny"
import { getCurrentUserRole } from "@/lib/actions/users"
import { formatMinutes } from "@/lib/utils/minutes"
import { PageHeader } from "@/components/shared/page-header"
import { PridatHodinyDialog } from "@/components/hodiny/pridat-hodiny-dialog"
import { HodinyDenniKarta } from "@/components/hodiny/hodiny-denni-karta"

export const metadata: Metadata = { title: "Hodiny-nábor" }

type ViewMode = "moje" | "team"

export default async function HodinyPage({
  searchParams,
}: {
  searchParams: Promise<{ mesic?: string; view?: string }>
}) {
  const params = await searchParams
  const now = new Date()
  const mesic = params.mesic ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const mesicLabel = new Date(`${mesic}-01`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })

  const role = await getCurrentUserRole()
  const isAdmin = role === "admin"

  // Default view: admin → team, náborářka → moje. Non-admin request team → redirect.
  const rawView = params.view
  if (!isAdmin && rawView === "team") {
    redirect(`/app/hodiny?view=moje&mesic=${mesic}`)
  }
  const view: ViewMode = rawView === "moje" || rawView === "team"
    ? rawView
    : isAdmin ? "team" : "moje"

  const aktivniNabidky = await getActiveNabidkyForPicker()

  const hodinyRaw: HodinyRowWithMeta[] = view === "team"
    ? await getAllHodiny({ mesic })
    : await getMyHodiny({ mesic })

  // Group by datum DESC
  const byDatum = new Map<string, HodinyRowWithMeta[]>()
  for (const h of hodinyRaw) {
    const arr = byDatum.get(h.datum) ?? []
    arr.push(h)
    byDatum.set(h.datum, arr)
  }
  const dniSorted = [...byDatum.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))

  const totalMinut = hodinyRaw.reduce((s, h) => s + Number(h.trvani_minut || 0), 0)

  const title = view === "team" ? "Hodiny-nábor — tým" : isAdmin ? "Moje hodiny-nábor" : "Moje hodiny"
  const description = `${mesicLabel} — celkem ${formatMinutes(totalMinut)}`

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link href="/app/hodiny/prehled">
                <Button variant="outline" size="sm">
                  Přehled zakázek
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </Link>
            )}
            <PridatHodinyDialog aktivniNabidky={aktivniNabidky} />
          </div>
        }
      />

      {/* Admin view toggle (Moje / Tým) */}
      {isAdmin && (
        <div className="flex gap-2">
          <Link href={`/app/hodiny?view=team&mesic=${mesic}`}>
            <Badge variant={view === "team" ? "default" : "outline"} className="cursor-pointer h-8 px-3">
              Tým
            </Badge>
          </Link>
          <Link href={`/app/hodiny?view=moje&mesic=${mesic}`}>
            <Badge variant={view === "moje" ? "default" : "outline"} className="cursor-pointer h-8 px-3">
              Moje
            </Badge>
          </Link>
        </div>
      )}

      {/* Month selector */}
      <div className="flex gap-2 flex-wrap">
        {[-2, -1, 0, 1].map((offset) => {
          const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
          const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          const label = d.toLocaleDateString("cs-CZ", { month: "short", year: "numeric" })
          const href = `/app/hodiny?mesic=${val}${isAdmin ? `&view=${view}` : ""}`
          return (
            <Link key={val} href={href}>
              <Badge variant={val === mesic ? "default" : "outline"} className="cursor-pointer h-8 px-3">
                {label}
              </Badge>
            </Link>
          )
        })}
      </div>

      {/* Day cards */}
      {dniSorted.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center gap-2">
            <Clock className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Žádné záznamy za {mesicLabel}</p>
            <p className="text-xs text-muted-foreground/70">Zapiš první hodiny kliknutím na „Zapsat hodiny" nahoře</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dniSorted.map((datum) => {
            const entries = byDatum.get(datum)!
            const isToday = datum === new Date().toISOString().slice(0, 10)
            return (
              <HodinyDenniKarta
                key={datum}
                datum={datum}
                entries={entries}
                aktivniNabidky={aktivniNabidky}
                showNaborar={view === "team"}
                defaultExpanded={isToday}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
