import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getAkce } from "@/lib/actions/akce"

export const metadata: Metadata = { title: "Akce" }

const stavBadge = {
  planovana: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  probehla: "bg-green-500/10 text-green-500 border-green-500/20",
  zrusena: "bg-red-500/10 text-red-500 border-red-500/20",
} as const

export default async function AkcePage() {
  const akce = await getAkce()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Akce</h1>
        <Link href="/app/akce/nova">
          <Button><Plus className="h-4 w-4 mr-2" />Nová akce</Button>
        </Link>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Název</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Místo</TableHead>
              <TableHead>Nabídka</TableHead>
              <TableHead>Přiřazeno</TableHead>
              <TableHead>Stav</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {akce.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Žádné akce. Vytvořte první akci.
                </TableCell>
              </TableRow>
            ) : akce.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <Link href={`/app/akce/${a.id}`} className="font-medium hover:underline">{a.nazev}</Link>
                </TableCell>
                <TableCell className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {new Date(a.datum).toLocaleDateString("cs-CZ")}
                  {a.cas_od && <span className="text-muted-foreground"> {a.cas_od.slice(0, 5)}</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">{a.misto || "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(a.nabidka as { nazev: string } | null)?.nazev || "—"}
                </TableCell>
                <TableCell>
                  {(a.prirazeni_count as { count: number }[])?.[0]?.count ?? 0}
                  {a.pocet_lidi ? `/${a.pocet_lidi}` : ""}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={stavBadge[a.stav as keyof typeof stavBadge] ?? ""}>
                    {a.stav === "planovana" ? "Plánovaná" : a.stav === "probehla" ? "Proběhla" : "Zrušená"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
