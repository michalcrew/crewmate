import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Calendar as CalendarIcon, ChevronLeft, ChevronRight, HardHat, Briefcase } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getAkce, getAkceCounts } from "@/lib/actions/akce"
import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { AkceTabs } from "@/components/akce/akce-tabs"
import { AkceRowActions } from "@/components/akce/akce-row-actions"
import { AkceStavSelector } from "@/components/akce/akce-stav-selector"

export const metadata: Metadata = { title: "Akce" }

type TabValue = "planovana" | "probehla" | "zrusena" | "all"
const VALID_STAVS: TabValue[] = ["planovana", "probehla", "zrusena", "all"]
const PAGE_SIZE = 30

function normalizeStav(raw?: string): TabValue {
  if (raw && (VALID_STAVS as string[]).includes(raw)) return raw as TabValue
  return "planovana"
}

function normalizePage(raw?: string): number {
  const n = raw ? parseInt(raw, 10) : 1
  if (!Number.isFinite(n) || n < 1) return 1
  return n
}

export default async function AkcePage({
  searchParams,
}: {
  searchParams?: Promise<{ stav?: string; page?: string }>
}) {
  const sp = (await searchParams) ?? {}
  const stav = normalizeStav(sp.stav)
  const page = normalizePage(sp.page)
  const offset = (page - 1) * PAGE_SIZE

  // getAkce() internally fires autoUkoncitProbeleAkceBatch() (rate-limited).
  const [{ data: akce, totalCount }, counts] = await Promise.all([
    getAkce({ stav, offset, limit: PAGE_SIZE }),
    getAkceCounts(),
  ])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const hasPrev = page > 1
  const hasNext = offset + akce.length < totalCount
  const showingFrom = totalCount === 0 ? 0 : offset + 1
  const showingTo = offset + akce.length

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
        description={
          totalCount > 0
            ? `Zobrazuji ${showingFrom}–${showingTo} z ${totalCount} akcí`
            : undefined
        }
        actions={
          <Link href="/app/akce/nova">
            <Button><Plus className="h-4 w-4 mr-1.5" />Nová akce</Button>
          </Link>
        }
      />

      <AkceTabs active={stav} counts={counts} />

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
                    <TableHead>Obsazenost</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {akce.map((a) => {
                    // Obsazenost per role — počítáme JEN status='prirazeny'.
                    // Náhradníci a vypadlí se nezapočítávají do obsazenosti.
                    const prirazeniRows = ((a as { prirazeni?: { role: string | null; status: string }[] }).prirazeni ?? [])
                      .filter((p) => p.status === "prirazeny")
                    const obsazenoBrig = prirazeniRows.filter((p) => p.role === "brigadnik").length
                    const obsazenoKoord = prirazeniRows.filter((p) => p.role === "koordinator").length
                    const targetBrig = (a as { pocet_brigadniku?: number | null }).pocet_brigadniku ?? 0
                    const targetKoord = (a as { pocet_koordinatoru?: number | null }).pocet_koordinatoru ?? 0
                    const daysUntil = Math.ceil((new Date(a.datum).getTime() - Date.now()) / 86400000)
                    const isUrgent = daysUntil <= 3 && daysUntil >= 0 && a.stav === "planovana"
                    // Barva čísla podle obsazenosti per role
                    const pctBrig = targetBrig > 0 ? (obsazenoBrig / targetBrig) * 100 : 100
                    const pctKoord = targetKoord > 0 ? (obsazenoKoord / targetKoord) * 100 : 100
                    const colorBrig = pctBrig >= 100 ? "text-green-600" : pctBrig >= 50 ? "text-amber-600" : "text-red-600"
                    const colorKoord = pctKoord >= 100 ? "text-green-600" : pctKoord >= 50 ? "text-amber-600" : "text-red-600"

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
                          <div className="flex items-center gap-3 text-sm tabular-nums">
                            <span
                              className={`flex items-center gap-1 ${colorBrig}`}
                              title={`Brigádníci: ${obsazenoBrig} z ${targetBrig} obsazeno`}
                            >
                              <HardHat className="h-4 w-4" />
                              <span className="font-medium">{obsazenoBrig}/{targetBrig}</span>
                            </span>
                            {targetKoord > 0 && (
                              <span
                                className={`flex items-center gap-1 ${colorKoord}`}
                                title={`Koordinátoři: ${obsazenoKoord} z ${targetKoord} obsazeno`}
                              >
                                <Briefcase className="h-4 w-4" />
                                <span className="font-medium">{obsazenoKoord}/{targetKoord}</span>
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <AkceStavSelector
                            akceId={a.id}
                            akceName={a.nazev}
                            akceDate={a.datum}
                            currentStav={a.stav ?? "planovana"}
                            size="sm"
                          />
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

      {/* Pagination controls — zobrazit jen pokud je víc než jedna stránka */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="text-muted-foreground">
            Strana {page} / {totalPages}
          </div>
          <div className="flex items-center gap-2">
            {hasPrev ? (
              <Link href={`/app/akce?stav=${stav}&page=${page - 1}`}>
                <Button variant="outline" size="sm">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Předchozí
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Předchozí
              </Button>
            )}
            {hasNext ? (
              <Link href={`/app/akce?stav=${stav}&page=${page + 1}`}>
                <Button variant="outline" size="sm">
                  Další
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Další
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
