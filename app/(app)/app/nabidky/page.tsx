import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getNabidky } from "@/lib/actions/nabidky"
import { NabidkyFilter } from "@/components/nabidky/nabidky-filter"
import { NABIDKA_TYPY } from "@/lib/constants"

export const metadata: Metadata = { title: "Zakázky" }

export default async function NabidkyPage({
  searchParams,
}: {
  searchParams: Promise<{ filtr?: string }>
}) {
  const params = await searchParams
  const nabidky = await getNabidky({ filtr: params.filtr })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Zakázky</h1>
        <Link href="/app/nabidky/nova">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nová zakázka
          </Button>
        </Link>
      </div>

      <NabidkyFilter currentFilter={params.filtr} />

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Název</TableHead>
              <TableHead>Město</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Zájemci</TableHead>
              <TableHead>Přijatí</TableHead>
              <TableHead>Vyřešeno</TableHead>
              <TableHead>Odmítnutí</TableHead>
              <TableHead>Stav</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nabidky.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Žádné zakázky. Vytvořte první zakázku.
                </TableCell>
              </TableRow>
            ) : (
              nabidky.map((n) => {
                const typConfig = NABIDKA_TYPY[n.typ as keyof typeof NABIDKA_TYPY]
                return (
                  <TableRow key={n.id}>
                    <TableCell>
                      <Link href={`/app/nabidky/${n.id}`} className="font-medium hover:underline">
                        {n.nazev}
                      </Link>
                      {n.klient && <p className="text-xs text-muted-foreground">{n.klient}</p>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{n.mesto || n.misto || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${typConfig?.color ?? ""}`}>
                        {typConfig?.label ?? n.typ}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-blue-500 font-medium">{n.stats?.zajemci ?? 0}</TableCell>
                    <TableCell className="text-orange-500 font-medium">{n.stats?.prijati ?? 0}</TableCell>
                    <TableCell className="text-green-500 font-medium">{n.stats?.vyreseno ?? 0}</TableCell>
                    <TableCell className="text-red-500 font-medium">{n.stats?.odmitnuty ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={n.stav === "ukoncena" ? "secondary" : "default"} className="text-xs">
                        {n.stav === "aktivni" ? "Aktivní" : n.stav === "pozastavena" ? "Pozastavená" : "Ukončená"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
