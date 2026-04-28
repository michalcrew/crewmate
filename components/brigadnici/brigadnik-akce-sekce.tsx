import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getBrigadnikAkce } from "@/lib/actions/brigadnici"

/**
 * F-0016 US-1A-1 — „Přiřazeno na akce" sekce v detailu brigádníka.
 *
 * Server component. Volá getBrigadnikAkce() která vrací split { budouci, historie }.
 *
 * - Budoucí (ASC) nahoře, Historie (DESC, LIMIT 100) dole.
 * - Každý řádek: Datum, Název akce + „Zrušena" tag, Zakázka (link nebo dash),
 *   Role (brigadnik/koordinator), Status badge (prirazeny/nahradnik/vypadl).
 */

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  prirazeny: { label: "Přiřazený", className: "bg-green-500/10 text-green-600 border-green-500/20" },
  nahradnik: { label: "Náhradník", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  vypadl:    { label: "Vypadl",    className: "bg-gray-400/10 text-gray-600 border-gray-400/20" },
}

type AkceRow = {
  id: string
  akce_id: string | null
  status: string
  role: string | null
  poradi_nahradnik: number | null
  akce: {
    id: string
    nazev: string | null
    datum: string
    cas_od: string | null
    cas_do: string | null
    misto: string | null
    stav: string | null
    nabidka_id: string | null
    nabidka: { id: string; nazev: string } | { id: string; nazev: string }[] | null
  }
}

function NabidkaCell({ nabidka }: { nabidka: AkceRow["akce"]["nabidka"] }) {
  const n = Array.isArray(nabidka) ? nabidka[0] : nabidka
  if (!n?.id) return <span className="text-muted-foreground">—</span>
  return (
    <Link href={`/app/nabidky/${n.id}`} className="text-sm hover:underline">
      {n.nazev}
    </Link>
  )
}

function AkceTable({ rows, emptyText }: { rows: AkceRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{emptyText}</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">Datum</TableHead>
          <TableHead>Název akce</TableHead>
          <TableHead>Zakázka</TableHead>
          <TableHead className="w-[120px]">Role</TableHead>
          <TableHead className="w-[120px]">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const stav = STATUS_CONFIG[r.status] ?? { label: r.status, className: "" }
          const zrusena = r.akce.stav === "zrusena"
          return (
            <TableRow key={r.id}>
              <TableCell className="text-xs tabular-nums whitespace-nowrap">
                {new Date(r.akce.datum).toLocaleDateString("cs-CZ")}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{r.akce.nazev ?? "—"}</span>
                  {zrusena && (
                    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-[10px]">
                      Zrušena
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <NabidkaCell nabidka={r.akce.nabidka} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.role ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={`${stav.className} text-xs`}>
                  {stav.label}
                </Badge>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export async function BrigadnikAkceSekce({ brigadnikId }: { brigadnikId: string }) {
  const { budouci, historie } = await getBrigadnikAkce(brigadnikId)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Budoucí akce ({budouci.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AkceTable
            rows={budouci as unknown as AkceRow[]}
            emptyText="Brigádník nemá žádná budoucí přiřazení."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Historie ({historie.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AkceTable
            rows={historie as unknown as AkceRow[]}
            emptyText="Žádná historie."
          />
          {historie.length >= 100 && (
            <p className="text-xs text-muted-foreground mt-3">
              Zobrazeno 100 nejnovějších záznamů.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
