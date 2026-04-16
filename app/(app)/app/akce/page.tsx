import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Calendar as CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getAkce } from "@/lib/actions/akce"
import { PageHeader } from "@/components/shared/page-header"
import { StatsCard } from "@/components/shared/stats-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"

export const metadata: Metadata = { title: "Akce" }

export default async function AkcePage() {
  const akce = await getAkce()

  const planovane = akce.filter(a => a.stav === "planovana").length
  const probehle = akce.filter(a => a.stav === "probehla").length
  const zrusene = akce.filter(a => a.stav === "zrusena").length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Akce"
        actions={
          <Link href="/app/akce/nova">
            <Button><Plus className="h-4 w-4 mr-1.5" />Nová akce</Button>
          </Link>
        }
      />

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatsCard icon={CalendarIcon} label="Plánované" value={planovane} />
        <StatsCard icon={CalendarIcon} label="Proběhlé" value={probehle} />
        <StatsCard icon={CalendarIcon} label="Zrušené" value={zrusene} />
      </div>

      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {akce.length === 0 ? (
            <EmptyState
              icon={CalendarIcon}
              title="Žádné akce"
              description="Naplánujte první akci a přiřaďte brigádníky."
              actionLabel="Vytvořit akci"
              actionHref="/app/akce/nova"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Název</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Místo</TableHead>
                    <TableHead>Nabídka</TableHead>
                    <TableHead>Kapacita</TableHead>
                    <TableHead>Stav</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {akce.map((a) => {
                    const prirazeno = (a.prirazeni_count as { count: number }[])?.[0]?.count ?? 0
                    const target = a.pocet_lidi ?? 0
                    const pct = target > 0 ? Math.round((prirazeno / target) * 100) : 0
                    const daysUntil = Math.ceil((new Date(a.datum).getTime() - Date.now()) / 86400000)
                    const isUrgent = daysUntil <= 3 && daysUntil >= 0 && a.stav === "planovana"

                    return (
                      <TableRow key={a.id} className={isUrgent ? "border-l-4 border-l-amber-400" : ""}>
                        <TableCell>
                          <Link href={`/app/akce/${a.id}`} className="font-medium hover:underline">{a.nazev}</Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            {new Date(a.datum).toLocaleDateString("cs-CZ")}
                            {a.cas_od && <span className="text-muted-foreground">{a.cas_od.slice(0, 5)}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{a.misto || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {(a.nabidka as { nazev: string } | null)?.nazev || "—"}
                        </TableCell>
                        <TableCell>
                          {target > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums text-muted-foreground">{prirazeno}/{target}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground tabular-nums">{prirazeno}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            variant={a.stav === "planovana" ? "info" : a.stav === "probehla" ? "success" : "danger"}
                            dot
                          >
                            {a.stav === "planovana" ? "Plánovaná" : a.stav === "probehla" ? "Proběhla" : "Zrušená"}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
