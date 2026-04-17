import type { Metadata } from "next"
import Link from "next/link"
import { Users, Briefcase, Calendar, UserPlus, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getDashboardData } from "@/lib/actions/dashboard"
import { PageHeader } from "@/components/shared/page-header"
import { StatsCard } from "@/components/shared/stats-card"
import { AlertBox } from "@/components/shared/alert-box"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default async function DashboardPage() {
  const { nabidky, akce, noviZajemciCount, brigadniciCount, chybejiciDpp } = await getDashboardData()
  // Server Component — renders once per request
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const daysUntilMap = new Map(akce.map(a => [a.id, Math.ceil((new Date(a.datum).getTime() - nowMs) / 86400000)]))

  // Build alert items from chybějící DPP
  const alertItems = [
    ...chybejiciDpp.length > 0
      ? [{
          text: `${chybejiciDpp.length} brigádník${chybejiciDpp.length === 1 ? "" : chybejiciDpp.length < 5 ? "i" : "ů"} bez DPP`,
          action: { label: "Zobrazit", href: "/app/brigadnici" },
        }]
      : [],
    ...akce.filter(a => {
      const d = daysUntilMap.get(a.id) ?? 0
      return d <= 3 && d >= 0
    }).map(a => {
      const d = Math.max(0, daysUntilMap.get(a.id) ?? 0)
      return {
        text: `Akce "${a.nazev}" za ${d} dn${d === 1 ? "í" : "ů"}`,
        action: { label: "Detail", href: `/app/akce/${a.id}` },
      }
    }),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Přehled klíčových metrik a úkolů"
        actions={
          <div className="flex gap-2">
            <Link href="/app/nabidky/nova"><Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1.5" />Zakázka</Button></Link>
            <Link href="/app/brigadnici/novy"><Button variant="outline" size="sm"><UserPlus className="h-4 w-4 mr-1.5" />Brigádník</Button></Link>
          </div>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard icon={Users} label="Brigádníci" value={brigadniciCount} />
        <StatsCard icon={Briefcase} label="Aktivní zakázky" value={nabidky.length} />
        <StatsCard icon={Calendar} label="Akce (14 dní)" value={akce.length} />
        <StatsCard icon={UserPlus} label="Noví zájemci (7d)" value={noviZajemciCount} />
      </div>

      {/* Attention alerts */}
      <AlertBox
        variant="warning"
        title="Vyžaduje pozornost"
        items={alertItems}
      />

      {/* Two-column: obsazenost akcí + blížící se akce */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Obsazenost akcí */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Obsazenost akcí</CardTitle>
              <Link href="/app/akce" className="text-xs text-primary hover:underline">
                Zobrazit vše
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {akce.length === 0 ? (
              <p className="text-sm text-muted-foreground">Žádné akce v příštích 14 dnech.</p>
            ) : (
              <div className="space-y-3">
                {akce.slice(0, 6).map((a) => {
                  const prirazeno = (a.prirazeni as { count: number }[])?.[0]?.count ?? 0
                  const target = a.pocet_lidi ?? 0
                  const pct = target > 0 ? Math.min(100, Math.round((prirazeno / target) * 100)) : 0
                  const color = pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400"
                  return (
                    <div key={a.id}>
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <Link href={`/app/akce/${a.id}`} className="text-sm font-medium hover:underline truncate flex-1">
                          {a.nazev}
                        </Link>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {new Date(a.datum).toLocaleDateString("cs-CZ")}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {prirazeno}{target > 0 ? `/${target}` : ""}{target > 0 ? ` · ${pct}%` : ""}
                        </span>
                      </div>
                      {target > 0 && (
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Blížící se akce */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Blížící se akce</CardTitle>
              <Link href="/app/akce" className="text-xs text-primary hover:underline">
                Zobrazit vše
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {akce.length === 0 ? (
              <p className="text-sm text-muted-foreground">Žádné akce v příštích 14 dnech.</p>
            ) : (
              <div className="space-y-3">
                {akce.slice(0, 6).map((a) => {
                  const prirazeno = (a.prirazeni as { count: number }[])?.[0]?.count ?? 0
                  const daysUntil = daysUntilMap.get(a.id) ?? 0
                  const isUrgent = daysUntil <= 3 && daysUntil >= 0
                  return (
                    <Link
                      key={a.id}
                      href={`/app/akce/${a.id}`}
                      className={`flex items-center justify-between p-2 -mx-2 rounded-lg transition-colors hover:bg-muted ${isUrgent ? "bg-amber-50" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.nazev}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.datum).toLocaleDateString("cs-CZ")}
                          {a.cas_od && ` ${a.cas_od.slice(0, 5)}`}
                          {a.misto && ` · ${a.misto}`}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0 ml-2 tabular-nums">
                        {prirazeno}{a.pocet_lidi ? `/${a.pocet_lidi}` : ""}
                      </Badge>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
