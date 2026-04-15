import type { Metadata } from "next"
import Link from "next/link"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Měsíční přehled" }

async function getMesicniData(mesic: string) {
  const supabase = await createClient()
  const start = `${mesic}-01`
  const [y, m] = mesic.split("-").map(Number)
  const nextM = (m ?? 0) === 12 ? 1 : (m ?? 0) + 1
  const nextY = (m ?? 0) === 12 ? (y ?? 0) + 1 : (y ?? 0)
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`

  const { data } = await supabase
    .from("dochazka")
    .select(`
      id, prichod, odchod, hodin_celkem, hodnoceni,
      brigadnik:brigadnici(id, jmeno, prijmeni),
      akce:akce!inner(id, nazev, datum),
      prirazeni_rel:prirazeni!inner(pozice)
    `)
    .gte("akce.datum", start)
    .lt("akce.datum", end)
    .order("created_at", { ascending: true })

  return data ?? []
}

export default async function PrehledMesicPage({
  searchParams,
}: {
  searchParams: Promise<{ mesic?: string }>
}) {
  const params = await searchParams
  const now = new Date()
  const mesic = params.mesic ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const data = await getMesicniData(mesic)

  // Aggregate per brigadnik
  const perBrigadnik = new Map<string, { jmeno: string; prijmeni: string; hodin: number; smeny: number }>()
  for (const d of data) {
    const b = d.brigadnik as unknown as { id: string; jmeno: string; prijmeni: string } | null
    if (!b) continue
    const existing = perBrigadnik.get(b.id)
    if (existing) {
      existing.hodin += Number(d.hodin_celkem ?? 0)
      existing.smeny += 1
    } else {
      perBrigadnik.set(b.id, {
        jmeno: b.jmeno,
        prijmeni: b.prijmeni,
        hodin: Number(d.hodin_celkem ?? 0),
        smeny: 1,
      })
    }
  }

  const mesicLabel = new Date(`${mesic}-01`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Měsíční přehled — {mesicLabel}</h1>
        <div className="flex gap-2">
          <Link href={`/api/export/dochazka?mesic=${mesic}`}>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />Docházka (Excel)
            </Button>
          </Link>
          <Link href={`/api/export/karty?mesic=${mesic}`}>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />Karty zaměstnanců
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {[-2, -1, 0, 1].map((offset) => {
          const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
          const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          const label = d.toLocaleDateString("cs-CZ", { month: "short", year: "numeric" })
          return (
            <Link key={val} href={`/app/prehled-mesic?mesic=${val}`}>
              <Button variant={val === mesic ? "default" : "outline"} size="sm">{label}</Button>
            </Link>
          )
        })}
      </div>

      <Card>
        <CardHeader><CardTitle>Souhrn per brigádník</CardTitle></CardHeader>
        <CardContent>
          {perBrigadnik.size === 0 ? (
            <p className="text-sm text-muted-foreground">Žádná docházka za tento měsíc.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brigádník</TableHead>
                  <TableHead>Počet směn</TableHead>
                  <TableHead>Hodin celkem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...perBrigadnik.entries()].map(([id, b]) => (
                  <TableRow key={id}>
                    <TableCell>
                      <Link href={`/app/brigadnici/${id}`} className="font-medium hover:underline">
                        {b.prijmeni} {b.jmeno}
                      </Link>
                    </TableCell>
                    <TableCell>{b.smeny}</TableCell>
                    <TableCell>{b.hodin.toFixed(1)}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
