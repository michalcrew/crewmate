import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Briefcase } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getNabidky } from "@/lib/actions/nabidky"
import { NabidkyFilter } from "@/components/nabidky/nabidky-filter"
import { TypBadge } from "@/components/nabidky/typ-badge"
import { PublishToggle } from "@/components/nabidky/publish-toggle"
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

  const totalPipeline = nabidky.reduce((sum, n) => sum + (n.stats?.zajemci ?? 0) + (n.stats?.prijati ?? 0) + (n.stats?.vyreseno ?? 0), 0)
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
                    <TableHead className="text-center">Pipeline</TableHead>
                    <TableHead className="text-center">Publikovat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nabidky.map((n) => {
                    const z = n.stats?.zajemci ?? 0
                    const p = n.stats?.prijati ?? 0
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
                          <div className="flex items-center justify-center gap-1 text-xs tabular-nums">
                            <span className="text-blue-600">{z}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-amber-600">{p}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-green-600">{v}</span>
                            {o > 0 && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-red-500">{o}✗</span>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <PublishToggle id={n.id} publikovano={n.publikovano} typ={n.typ} />
                          </div>
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
