import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Briefcase, UserCog, HardHat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getNabidky } from "@/lib/actions/nabidky"
import { NabidkyFilter } from "@/components/nabidky/nabidky-filter"
import { TypBadge } from "@/components/nabidky/typ-badge"
import { PublishToggle } from "@/components/nabidky/publish-toggle"
import { UkoncitButton } from "@/components/nabidky/detail/ukoncit-button"
import { ZobrazitNabidkuButton } from "@/components/nabidky/zobrazit-nabidku-button"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"

export const metadata: Metadata = { title: "Zakázky" }

export default async function NabidkyPage({
  searchParams,
}: {
  searchParams: Promise<{ filtr?: string }>
}) {
  const params = await searchParams
  const nabidky = await getNabidky({ filtr: params.filtr })

  const totalPipeline = nabidky.reduce((sum, n) => {
    const s = n.stats
    if (!s) return sum
    return sum + s.zajemci + s.kontaktovani + s.nehotovi + s.vyreseno
  }, 0)
  const totalPrijati = nabidky.reduce((sum, n) => sum + (n.stats?.vyreseno ?? 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Zakázky"
        description={nabidky.length > 0 ? `${nabidky.length} zakázek · ${totalPipeline} v pipeline · ${totalPrijati} vyřešených` : undefined}
        actions={
          <Link href="/app/nabidky/nova">
            <Button><Plus className="h-4 w-4 mr-1.5" />Nová zakázka</Button>
          </Link>
        }
      />

      <NabidkyFilter currentFilter={params.filtr} />

      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {nabidky.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="Žádné zakázky"
              description="Vytvořte první zakázku a začněte nabírat brigádníky."
              actionLabel="Nová zakázka"
              actionHref="/app/nabidky/nova"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Název</TableHead>
                    <TableHead>Město</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Tým</TableHead>
                    <TableHead className="text-center">Pipeline</TableHead>
                    <TableHead className="text-center">Publikovat</TableHead>
                    <TableHead className="text-center w-12"></TableHead>
                    <TableHead className="text-center w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nabidky.map((n) => {
                    const z = n.stats?.zajemci ?? 0
                    const k = n.stats?.kontaktovani ?? 0
                    const nh = n.stats?.nehotovi ?? 0
                    const v = n.stats?.vyreseno ?? 0
                    const o = n.stats?.odmitnuty ?? 0
                    return (
                      <TableRow key={n.id} className="group">
                        <TableCell>
                          <Link href={`/app/nabidky/${n.id}`} className="font-medium hover:underline">
                            {n.nazev}
                          </Link>
                          {n.klient && <p className="text-xs text-muted-foreground">{n.klient}</p>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{n.mesto || n.misto || "—"}</TableCell>
                        <TableCell>
                          <TypBadge typ={n.typ} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-xs tabular-nums" title="Koordinátoři / Brigádníci">
                            <span className="flex items-center gap-1">
                              <UserCog className="h-3 w-3 text-blue-600" />
                              {(n as { pocet_koordinatoru?: number | null }).pocet_koordinatoru ?? 0}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="flex items-center gap-1">
                              <HardHat className="h-3 w-3 text-amber-600" />
                              {(n as { pocet_brigadniku?: number | null }).pocet_brigadniku ?? 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1 text-xs tabular-nums" title="Zájemce → Kontaktován → Nehotová admin → Vše vyřešeno · Odmítnutý">
                            <span className="text-blue-500">{z}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-yellow-500">{k}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-orange-500">{nh}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-green-500">{v}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-red-500">{o}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <PublishToggle id={n.id} publikovano={n.publikovano} typ={n.typ} />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <ZobrazitNabidkuButton
                            slug={n.slug}
                            publikovano={n.publikovano}
                            variant="icon"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          {n.typ !== "ukoncena" && (
                            <UkoncitButton id={n.id} nazev={n.nazev} variant="icon" />
                          )}
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
