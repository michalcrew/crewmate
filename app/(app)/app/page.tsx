import type { Metadata } from "next"
import Link from "next/link"
import { Users, Briefcase, Calendar, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getDashboardData } from "@/lib/actions/dashboard"
import { DPP_STATES } from "@/lib/constants"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default async function DashboardPage() {
  const { nabidky, akce, noviZajemciCount, brigadniciCount, chybejiciDpp } = await getDashboardData()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Brigádníci
            </div>
            <p className="text-3xl font-bold mt-1">{brigadniciCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Briefcase className="h-4 w-4" />
              Aktivní nabídky
            </div>
            <p className="text-3xl font-bold mt-1">{nabidky.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Calendar className="h-4 w-4" />
              Akce (14 dní)
            </div>
            <p className="text-3xl font-bold mt-1">{akce.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4 text-blue-500" />
              Noví zájemci (7d)
            </div>
            <p className="text-3xl font-bold mt-1">{noviZajemciCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Obsazenost zakázek */}
      <Card>
        <CardHeader>
          <CardTitle>Obsazenost zakázek</CardTitle>
        </CardHeader>
        <CardContent>
          {nabidky.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádné aktivní nabídky.</p>
          ) : (
            <div className="space-y-3">
              {nabidky.map((n) => {
                const pipelineCount = (n.pipeline_entries as { count: number }[])?.[0]?.count ?? 0
                const target = n.pocet_lidi ?? 0
                const pct = target > 0 ? Math.min(100, Math.round((pipelineCount / target) * 100)) : 0
                const color = pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500"
                return (
                  <div key={n.id}>
                    <div className="flex items-center justify-between mb-1">
                      <Link href={`/app/nabidky/${n.id}`} className="text-sm font-medium hover:underline">
                        {n.nazev}
                      </Link>
                      <span className="text-sm text-muted-foreground">
                        {pipelineCount}{target > 0 ? `/${target}` : ""}
                      </span>
                    </div>
                    {target > 0 && (
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Blížící se akce */}
        <Card>
          <CardHeader>
            <CardTitle>Blížící se akce</CardTitle>
          </CardHeader>
          <CardContent>
            {akce.length === 0 ? (
              <p className="text-sm text-muted-foreground">Žádné akce v příštích 14 dnech.</p>
            ) : (
              <div className="space-y-3">
                {akce.map((a) => {
                  const prirazeno = (a.prirazeni as { count: number }[])?.[0]?.count ?? 0
                  return (
                    <div key={a.id} className="flex items-center justify-between">
                      <div>
                        <Link href={`/app/akce/${a.id}`} className="text-sm font-medium hover:underline">
                          {a.nazev}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.datum).toLocaleDateString("cs-CZ")}
                          {a.cas_od && ` ${a.cas_od.slice(0, 5)}`}
                          {a.misto && ` | ${a.misto}`}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {prirazeno}{a.pocet_lidi ? `/${a.pocet_lidi}` : ""}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chybějící DPP */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Chybějící DPP
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chybejiciDpp.length === 0 ? (
              <p className="text-sm text-muted-foreground">Všichni přiřazení mají DPP v pořádku.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brigádník</TableHead>
                      <TableHead>Akce</TableHead>
                      <TableHead>DPP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chybejiciDpp.map((d) => (
                      <TableRow key={`${d.id}-${d.akce_nazev}`}>
                        <TableCell>
                          <Link href={`/app/brigadnici/${d.id}`} className="text-sm hover:underline">
                            {d.prijmeni} {d.jmeno}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.akce_nazev} ({new Date(d.akce_datum).toLocaleDateString("cs-CZ")})
                        </TableCell>
                        <TableCell>
                          <span className={DPP_STATES[d.dpp_stav as keyof typeof DPP_STATES]?.color ?? "text-red-500"}>
                            {DPP_STATES[d.dpp_stav as keyof typeof DPP_STATES]?.label ?? "Chybí"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
