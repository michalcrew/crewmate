import type { Metadata } from "next"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getMyHodiny, getHodinySouhrn, getAllHodiny, getRecruitmentMetrics } from "@/lib/actions/naborar-hodiny"
import { getCurrentUserRole } from "@/lib/actions/users"
import { ZapsatHodinyDialog } from "@/components/hodiny/zapsat-hodiny-dialog"
import { PageHeader } from "@/components/shared/page-header"

export const metadata: Metadata = { title: "Moje hodiny" }

export default async function HodinyPage({
  searchParams,
}: {
  searchParams: Promise<{ mesic?: string }>
}) {
  const params = await searchParams
  const now = new Date()
  const mesic = params.mesic ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const mesicLabel = new Date(`${mesic}-01`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })

  const role = await getCurrentUserRole()
  const isAdmin = role === "admin"

  const myHodiny = await getMyHodiny(mesic)
  const myTotal = myHodiny.reduce((sum, h) => sum + Number(h.hodin), 0)

  // Admin data
  const souhrn = isAdmin ? await getHodinySouhrn(mesic) : []
  const allHodiny = isAdmin ? await getAllHodiny(mesic) : []
  const metrics = isAdmin ? await getRecruitmentMetrics(mesic) : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Moje hodiny"
        description={mesicLabel}
        actions={<ZapsatHodinyDialog />}
      />

      {/* Month selector */}
      <div className="flex gap-2">
        {[-2, -1, 0, 1].map((offset) => {
          const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
          const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          const label = d.toLocaleDateString("cs-CZ", { month: "short", year: "numeric" })
          return (
            <Link key={val} href={`/app/hodiny?mesic=${val}`}>
              <Badge variant={val === mesic ? "default" : "outline"} className="cursor-pointer">{label}</Badge>
            </Link>
          )
        })}
      </div>

      {/* Recruitment metrics */}
      {isAdmin && metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Hodin celkem</p>
              <p className="text-2xl font-bold">{metrics.totalHours.toFixed(1)}h</p>
              <p className="text-xs text-muted-foreground">{metrics.totalCost.toLocaleString("cs-CZ")} Kč</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Nabráno lidí</p>
              <p className="text-2xl font-bold">{metrics.hiredCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Náklad / nabraný</p>
              <p className="text-2xl font-bold">
                {metrics.costPerHired ? `${metrics.costPerHired.toLocaleString("cs-CZ")} Kč` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Náklad / akce</p>
              <p className="text-2xl font-bold">
                {metrics.costPerEvent ? `${metrics.costPerEvent.toLocaleString("cs-CZ")} Kč` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Admin overview */}
      {isAdmin && souhrn.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Souhrn týmu — {mesicLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Náborářka</TableHead>
                    <TableHead>Dní</TableHead>
                    <TableHead>Hodin celkem</TableHead>
                    <TableHead>Ø hodin/den</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {souhrn.map((s) => (
                    <TableRow key={s.jmeno + s.prijmeni}>
                      <TableCell className="font-medium">{s.jmeno} {s.prijmeni}</TableCell>
                      <TableCell>{s.dnu}</TableCell>
                      <TableCell className="font-semibold">{s.celkem.toFixed(1)}h</TableCell>
                      <TableCell>{(s.celkem / s.dnu).toFixed(1)}h</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* My hours */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isAdmin ? "Všechny záznamy" : "Moje hodiny"} — {mesicLabel}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({isAdmin ? allHodiny.reduce((s, h) => s + Number(h.hodin), 0).toFixed(1) : myTotal.toFixed(1)}h celkem)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && <TableHead>Náborářka</TableHead>}
                  <TableHead>Datum</TableHead>
                  <TableHead>Hodin</TableHead>
                  <TableHead>Místo</TableHead>
                  <TableHead>Náplň práce</TableHead>
                  <TableHead>Stav</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(isAdmin ? allHodiny : myHodiny).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">
                      Žádné záznamy za tento měsíc.
                    </TableCell>
                  </TableRow>
                ) : (
                  (isAdmin ? allHodiny : myHodiny).map((h) => (
                    <TableRow key={h.id}>
                      {isAdmin && (
                        <TableCell className="font-medium">
                          {(h.naborar as unknown as { jmeno: string; prijmeni: string } | null)?.jmeno}{" "}
                          {(h.naborar as unknown as { jmeno: string; prijmeni: string } | null)?.prijmeni}
                        </TableCell>
                      )}
                      <TableCell>{new Date(h.datum).toLocaleDateString("cs-CZ")}</TableCell>
                      <TableCell className="font-semibold">{Number(h.hodin).toFixed(1)}h</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {(h as unknown as { misto_prace?: string }).misto_prace === "kancelar" ? "Kancelář" :
                           (h as unknown as { misto_prace?: string }).misto_prace === "remote" ? "Remote" :
                           (h as unknown as { misto_prace?: string }).misto_prace === "akce" ? "Na akci" : "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{h.napln_prace}</TableCell>
                      <TableCell>
                        {h.je_zpetny_zapis ? (
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-xs" title={h.duvod_zpozdeni ?? ""}>
                            Zpětný zápis
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">
                            Včas
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
