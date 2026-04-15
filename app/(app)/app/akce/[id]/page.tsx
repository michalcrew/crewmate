import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, MapPin, Calendar, Clock, Users, Key } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getAkceById, getAkcePrirazeni } from "@/lib/actions/akce"
import { DPP_STATES } from "@/lib/constants"

export const metadata: Metadata = { title: "Detail akce" }

export default async function AkceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const akce = await getAkceById(id)
  if (!akce) notFound()

  const prirazeni = await getAkcePrirazeni(id)
  const prirazeniCount = prirazeni.filter((p) => p.status === "prirazeny").length
  const nahradniciCount = prirazeni.filter((p) => p.status === "nahradnik").length

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/akce">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{akce.nazev}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(akce.datum).toLocaleDateString("cs-CZ")}</span>
            {akce.cas_od && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{akce.cas_od.slice(0, 5)}{akce.cas_do ? ` — ${akce.cas_do.slice(0, 5)}` : ""}</span>}
            {akce.misto && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{akce.misto}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Přiřazeno</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {prirazeniCount}{akce.pocet_lidi ? `/${akce.pocet_lidi}` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Náhradníci</span>
            </div>
            <p className="text-2xl font-bold mt-1">{nahradniciCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">PIN pro koordinátora</span>
            </div>
            <p className="text-2xl font-bold mt-1 font-mono">{akce.pin_kod}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Přiřazení brigádníci</CardTitle>
        </CardHeader>
        <CardContent>
          {prirazeni.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatím nikdo přiřazený.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brigádník</TableHead>
                  <TableHead>Pozice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Příchod</TableHead>
                  <TableHead>Odchod</TableHead>
                  <TableHead>Hodin</TableHead>
                  <TableHead>Hodnocení</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prirazeni.map((p) => {
                  const b = p.brigadnik as { id: string; jmeno: string; prijmeni: string; telefon: string } | null
                  const d = (p.dochazka as { prichod: string | null; odchod: string | null; hodin_celkem: number | null; hodnoceni: number | null }[])?.[0]
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        {b ? (
                          <Link href={`/app/brigadnici/${b.id}`} className="font-medium hover:underline">
                            {b.prijmeni} {b.jmeno}
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.pozice || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          p.status === "prirazeny" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                          p.status === "nahradnik" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                          "bg-red-500/10 text-red-500 border-red-500/20"
                        }>
                          {p.status === "prirazeny" ? "Přiřazený" : p.status === "nahradnik" ? `Náhradník #${p.poradi_nahradnik ?? ""}` : "Vypadl"}
                        </Badge>
                      </TableCell>
                      <TableCell>{d?.prichod?.slice(0, 5) ?? "—"}</TableCell>
                      <TableCell>{d?.odchod?.slice(0, 5) ?? "—"}</TableCell>
                      <TableCell>{d?.hodin_celkem != null ? `${d.hodin_celkem}h` : "—"}</TableCell>
                      <TableCell>{d?.hodnoceni ? `${d.hodnoceni}/5` : "—"}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
