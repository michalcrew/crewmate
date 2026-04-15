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
import { getBrigadnici } from "@/lib/actions/brigadnici"
import { BrigadniciSearch } from "@/components/brigadnici/brigadnici-search"
import { DPP_STATES } from "@/lib/constants"

export const metadata: Metadata = {
  title: "Brigádníci",
}

export default async function BrigadniciPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const brigadnici = await getBrigadnici({ search: params.q })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Brigádníci</h1>
        <Link href="/app/brigadnici/novy">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Přidat brigádníka
          </Button>
        </Link>
      </div>

      <BrigadniciSearch />

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jméno</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Akce</TableHead>
              <TableHead>Údaje</TableHead>
              <TableHead>DPP tento měsíc</TableHead>
              <TableHead>DPP příští měsíc</TableHead>
              <TableHead>Hodnocení</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brigadnici.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {params.q
                    ? `Žádní brigádníci pro "${params.q}"`
                    : "Žádní brigádníci. Přidejte prvního brigádníka."}
                </TableCell>
              </TableRow>
            ) : (
              brigadnici.map((b) => {
                const dppCurrentState = DPP_STATES[((b as { dpp_tento_mesic?: string }).dpp_tento_mesic ?? "zadny") as keyof typeof DPP_STATES]
                const dppNextState = DPP_STATES[((b as { dpp_pristi_mesic?: string }).dpp_pristi_mesic ?? "zadny") as keyof typeof DPP_STATES]
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link
                        href={`/app/brigadnici/${b.id}`}
                        className="font-medium hover:underline"
                      >
                        {b.prijmeni} {b.jmeno}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.telefon}</TableCell>
                    <TableCell className="text-muted-foreground">{b.email}</TableCell>
                    <TableCell className="text-center">
                      {(b as { pocet_akci?: number }).pocet_akci ?? 0}
                    </TableCell>
                    <TableCell>
                      {b.dotaznik_vyplnen
                        ? <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">Vyplněno</Badge>
                        : <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">Chybí</Badge>
                      }
                    </TableCell>
                    <TableCell>
                      <span className={dppCurrentState?.color ?? ""}>
                        {dppCurrentState?.label ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={dppNextState?.color ?? ""}>
                        {dppNextState?.label ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {Number(b.prumerne_hodnoceni) > 0 ? `${b.prumerne_hodnoceni} / 5` : "—"}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground mt-2">
        {brigadnici.length} brigádník{brigadnici.length === 1 ? "" : brigadnici.length < 5 ? "i" : "ů"}
      </p>
    </div>
  )
}
