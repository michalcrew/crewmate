import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getNabidky } from "@/lib/actions/nabidky"
import { NabidkyFilter } from "@/components/nabidky/nabidky-filter"

export const metadata: Metadata = {
  title: "Nabídky",
}

const stavBadge = {
  aktivni: "bg-green-500/10 text-green-500 border-green-500/20",
  pozastavena: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  ukoncena: "bg-muted text-muted-foreground border-border",
} as const

export default async function NabidkyPage({
  searchParams,
}: {
  searchParams: Promise<{ stav?: string }>
}) {
  const params = await searchParams
  const nabidky = await getNabidky({ stav: params.stav })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Nabídky</h1>
        <Link href="/app/nabidky/nova">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nová nabídka
          </Button>
        </Link>
      </div>

      <NabidkyFilter currentStav={params.stav} />

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Název</TableHead>
              <TableHead>Klient</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Pipeline</TableHead>
              <TableHead>Stav</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nabidky.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Žádné nabídky. Vytvořte první nabídku.
                </TableCell>
              </TableRow>
            ) : (
              nabidky.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>
                    <Link
                      href={`/app/nabidky/${n.id}`}
                      className="font-medium hover:underline"
                    >
                      {n.nazev}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {n.klient || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {n.typ === "prubezna" ? "Průběžná" : "Jednorázová"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(n.pipeline_count as { count: number }[])?.[0]?.count ?? 0}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={stavBadge[n.stav as keyof typeof stavBadge] ?? ""}
                    >
                      {n.stav === "aktivni" ? "Aktivní" : n.stav === "pozastavena" ? "Pozastavená" : "Ukončená"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
