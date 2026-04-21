import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getBrigadnici } from "@/lib/actions/brigadnici"
import { BrigadniciSearch } from "@/components/brigadnici/brigadnici-search"
import { BrigadniciListFilters } from "@/components/brigadnici/brigadnici-list-filters"
import { FakturantBadge } from "@/components/brigadnici/fakturant-badge"
import { DokumentacniStavSelect } from "@/components/brigadnici/dokumentacni-stav-select"
import { StarRating } from "@/components/ui/star-rating"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"

export const metadata: Metadata = {
  title: "Brigádníci",
}

export default async function BrigadniciPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; typ?: string; stav?: string }>
}) {
  const params = await searchParams

  // F-0016 US-1D-1 / US-1G-1: server-side filter (Backend `getBrigadnici` accepts
  // `typFilter` + `stavFilter`; do NOT post-filter on client — chokepoint for pagination later).
  const typFilter: "all" | "brigadnik" | "osvc" =
    params.typ === "brigadnik" || params.typ === "osvc" ? params.typ : "all"
  const stavFilter = (params.stav ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const brigadnici = await getBrigadnici({
    search: params.q,
    typFilter,
    stavFilter: stavFilter.length > 0 ? stavFilter : undefined,
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Brigádníci"
        description={`${brigadnici.length} brigádník${brigadnici.length === 1 ? "" : brigadnici.length < 5 ? "i" : "ů"}`}
        actions={
          <Link href="/app/brigadnici/novy">
            <Button><Plus className="h-4 w-4 mr-1.5" />Přidat brigádníka</Button>
          </Link>
        }
      />

      <BrigadniciSearch />

      <BrigadniciListFilters />

      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {brigadnici.length === 0 ? (
            <EmptyState
              icon={Users}
              title={params.q ? `Žádní brigádníci pro "${params.q}"` : "Žádní brigádníci"}
              description={params.q ? "Zkuste jiný hledaný výraz." : "Přidejte prvního brigádníka a začněte nabírat."}
              actionLabel={params.q ? undefined : "Přidat brigádníka"}
              actionHref={params.q ? undefined : "/app/brigadnici/novy"}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jméno</TableHead>
                    <TableHead className="hidden sm:table-cell">Telefon</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="text-center">Akce</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead className="text-center">Hodnocení</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Hodiny/rok</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brigadnici.map((b) => {
                    const rating = Number(b.prumerne_hodnoceni)
                    const hodinyRok = Number((b as { hodiny_rok?: number }).hodiny_rok ?? 0)
                    const stav = (b as { global_dokumentacni_stav?: string | null }).global_dokumentacni_stav
                    const needsAction = stav === "nevyplnene_udaje" || stav === "ukoncena_dpp"

                    return (
                      <TableRow key={b.id} className={needsAction ? "bg-amber-50/50" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FakturantBadge typ={(b as { typ_brigadnika?: string | null }).typ_brigadnika} variant="prefix" />
                            <Link href={`/app/brigadnici/${b.id}`} className="font-medium hover:underline">
                              {b.prijmeni} {b.jmeno}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">{b.telefon}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{b.email}</TableCell>
                        <TableCell className="text-center tabular-nums">
                          {(b as { pocet_akci?: number }).pocet_akci ?? 0}
                        </TableCell>
                        <TableCell>
                          <DokumentacniStavSelect
                            brigadnikId={b.id}
                            current={stav}
                            ariaLabel={`${b.prijmeni} ${b.jmeno}`}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <StarRating
                            value={rating}
                            count={(b as { pocet_hodnoceni?: number }).pocet_hodnoceni}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums hidden lg:table-cell">
                          {hodinyRok > 0 ? `${Math.round(hodinyRok)} h` : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
