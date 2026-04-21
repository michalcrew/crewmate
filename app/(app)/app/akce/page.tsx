import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Calendar as CalendarIcon, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getAkce, getAkceCounts } from "@/lib/actions/akce"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { AkceTabs } from "@/components/akce/akce-tabs"
import { AkceRowActions } from "@/components/akce/akce-row-actions"

export const metadata: Metadata = { title: "Akce" }

type TabValue = "planovana" | "probehla" | "zrusena" | "all"
const VALID_STAVS: TabValue[] = ["planovana", "probehla", "zrusena", "all"]

function normalizeStav(raw?: string): TabValue {
  if (raw && (VALID_STAVS as string[]).includes(raw)) return raw as TabValue
  return "planovana"
}

export default async function AkcePage({
  searchParams,
}: {
  searchParams?: Promise<{ stav?: string }>
}) {
  const sp = (await searchParams) ?? {}
  const stav = normalizeStav(sp.stav)

  // getAkce() internally fires autoUkoncitProbeleAkceBatch() (rate-limited).
  const [{ data: akce, totalCount }, counts] = await Promise.all([
    getAkce({ stav }),
    getAkceCounts(),
  ])

  const limitReached = akce.length >= 500 && totalCount > 500

  const emptyConfig: Record<TabValue, { title: string; description: string; showCta: boolean }> = {
    planovana: {
      title: "Žádné plánované akce",
      description: "Zakázky najdete v /app/nabidky a přidáte jim akce z detailu zakázky.",
      showCta: true,
    },
    probehla: {
      title: "Žádné proběhlé akce v tomto filtru",
      description: "Proběhlé akce se zde zobrazí, jakmile se některá plánovaná automaticky uzavře.",
      showCta: false,
    },
    zrusena: {
      title: "Žádné zrušené akce",
      description: "Zrušit akci lze z detailu, z menu v listu, nebo z matrix sloupce zakázky.",
      showCta: false,
    },
    all: {
      title: "Žádné akce v systému",
      description: "Vytvořte první akci nebo ji přidejte z detailu zakázky.",
      showCta: true,
    },
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Akce"
        description={totalCount > 0 ? `Zobrazuji ${akce.length} z ${totalCount} akcí` : undefined}
        actions={
          <Link href="/app/akce/nova">
            <Button><Plus className="h-4 w-4 mr-1.5" />Nová akce</Button>
          </Link>
        }
      />

      <AkceTabs active={stav} counts={counts} />

      {limitReached && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Zobrazeno prvních 500 akcí z {totalCount}. Pro starší historii použijte měsíční filter
            (připravuje se ve F-0018) nebo detail zakázky.
          </p>
        </div>
      )}

      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {akce.length === 0 ? (
            <EmptyState
              icon={CalendarIcon}
              title={emptyConfig[stav].title}
              description={emptyConfig[stav].description}
              actionLabel={emptyConfig[stav].showCta ? "Vytvořit akci" : undefined}
              actionHref={emptyConfig[stav].showCta ? "/app/akce/nova" : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Název</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Místo</TableHead>
                    <TableHead>Nabídka</TableHead>
                    <TableHead>Kapacita</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {akce.map((a) => {
                    const prirazeno = (a.prirazeni_count as { count: number }[])?.[0]?.count ?? 0
                    const target = a.pocet_lidi ?? 0
                    const pct = target > 0 ? Math.round((prirazeno / target) * 100) : 0
                    const daysUntil = Math.ceil((new Date(a.datum).getTime() - Date.now()) / 86400000)
                    const isUrgent = daysUntil <= 3 && daysUntil >= 0 && a.stav === "planovana"

                    return (
                      <TableRow key={a.id} className={isUrgent ? "border-l-4 border-l-amber-400" : ""}>
                        <TableCell>
                          <Link href={`/app/akce/${a.id}`} className="font-medium hover:underline">{a.nazev}</Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            {new Date(a.datum).toLocaleDateString("cs-CZ")}
                            {a.cas_od && <span className="text-muted-foreground">{a.cas_od.slice(0, 5)}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{a.misto || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {(a.nabidka as { nazev: string } | null)?.nazev || "—"}
                        </TableCell>
                        <TableCell>
                          {target > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                                  style={{ width: `${Math.min(100, pct)}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums text-muted-foreground">{prirazeno}/{target}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground tabular-nums">{prirazeno}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            variant={a.stav === "planovana" ? "info" : a.stav === "probehla" ? "success" : "danger"}
                            dot
                          >
                            {a.stav === "planovana" ? "Plánovaná" : a.stav === "probehla" ? "Proběhla" : "Zrušená"}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-center">
                          <AkceRowActions
                            akceId={a.id}
                            akceName={a.nazev}
                            akceDate={a.datum}
                            akceStav={a.stav ?? "planovana"}
                          />
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
