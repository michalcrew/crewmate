"use client"

import { useMemo, useState, useTransition, useOptimistic } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Calendar, MapPin, Copy, Send, ClipboardList, Loader2, MoreHorizontal, Ban } from "lucide-react"
import { PIPELINE_STATES } from "@/lib/constants"
import { updatePipelineStav } from "@/lib/actions/pipeline"
import { assignBrigadnikToAkce, unassignBrigadnikFromAkce, odeslatBriefing } from "@/lib/actions/akce"
import { DokumentacniStavSelect } from "@/components/brigadnici/dokumentacni-stav-select"
import { FakturantBadge } from "@/components/brigadnici/fakturant-badge"
import { StarRating } from "@/components/ui/star-rating"
import { PipelineEntryPoznamkaPopover } from "@/components/pipeline/pipeline-entry-poznamka-popover"
import { AkceStavSelector } from "@/components/akce/akce-stav-selector"
import { ZrusitAkciDialog } from "@/components/akce/zrusit-akci-dialog"

// ========== Types ==========

export type PipelineEntry = {
  id: string
  stav: string
  brigadnik: {
    id: string
    jmeno: string
    prijmeni: string
    email: string
    telefon: string
    dotaznik_vyplnen: boolean
    typ_brigadnika?: "brigadnik" | "osvc" | null
  } | null
  naborar: { jmeno: string; prijmeni: string } | null
  dpp_stav?: string | null
  prohlaseni_stav?: string | null
  hodiny_ytd?: number
  hodiny_rok?: number | null
  avg_hodnoceni?: number | null
  pocet_hodnoceni?: number | null
  poznamky?: string | null
}

export type AkceWithPrirazeni = {
  id: string
  nazev: string
  datum: string
  cas_od: string | null
  cas_do: string | null
  misto: string | null
  pocet_lidi: number | null
  pin_kod: string | null
  stav: string
  prirazeni: Array<{
    id: string
    brigadnik_id: string
    pozice: string | null
    status: string
    brigadnik: { id: string; jmeno: string; prijmeni: string } | null
  }>
}

const ELIGIBLE_STAVS = ["prijaty_nehotova_admin", "prijaty_vse_vyreseno"]

// ========== Main component ==========

export function NabidkaDetailClient({
  nabidkaId,
  nabidkaTyp,
  pipeline,
  akce,
  readOnly,
  dokumentacniMap,
}: {
  nabidkaId: string
  nabidkaTyp: string
  pipeline: PipelineEntry[]
  akce: AkceWithPrirazeni[]
  readOnly: boolean
  dokumentacniMap?: Record<string, string>
}) {
  return (
    <div className="space-y-8">
      <PipelineSection
        pipeline={pipeline}
        nabidkaId={nabidkaId}
        readOnly={readOnly}
        dokumentacniMap={dokumentacniMap ?? {}}
      />
      <AssignmentMatrix
        pipeline={pipeline}
        akce={akce}
        readOnly={readOnly}
        nabidkaTyp={nabidkaTyp}
        dokumentacniMap={dokumentacniMap ?? {}}
      />
    </div>
  )
}

// ========== Pipeline section (kanban, DnD between columns only) ==========

function PipelineSection({
  pipeline,
  nabidkaId,
  readOnly,
  dokumentacniMap,
}: {
  pipeline: PipelineEntry[]
  nabidkaId: string
  readOnly: boolean
  dokumentacniMap: Record<string, string>
}) {
  const [activeEntry, setActiveEntry] = useState<PipelineEntry | null>(null)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const pipelineByStav = Object.keys(PIPELINE_STATES).reduce(
    (acc, stav) => {
      acc[stav] = pipeline.filter(e => e.stav === stav)
      return acc
    },
    {} as Record<string, PipelineEntry[]>
  )

  function handleDragStart(event: DragStartEvent) {
    if (readOnly) return
    const id = String(event.active.id)
    const entryId = id.startsWith("brig:") ? id.slice(5) : id
    const entry = pipeline.find(e => e.id === entryId)
    setActiveEntry(entry ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveEntry(null)
    if (readOnly) return
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const entryId = activeId.startsWith("brig:") ? activeId.slice(5) : activeId
    const newStav = overId.startsWith("col:") ? overId.slice(4) : overId

    const entry = pipeline.find(e => e.id === entryId)
    if (!entry) return
    if (entry.stav === newStav) return

    const stavLabel = PIPELINE_STATES[newStav as keyof typeof PIPELINE_STATES]?.label ?? newStav
    startTransition(async () => {
      const result = await updatePipelineStav(entry.id, newStav, nabidkaId)
      if (result.error) toast.error(result.error)
      else toast.success(`Stav změněn na: ${stavLabel}`)
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <section className={isPending ? "opacity-60 pointer-events-none" : ""}>
        <h2 className="text-lg font-medium mb-3">
          Pipeline ({pipeline.length} brigádník{pipeline.length === 1 ? "" : pipeline.length < 5 ? "i" : "ů"})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Object.entries(PIPELINE_STATES).map(([stav, config]) => (
            <PipelineColumn
              key={stav}
              stav={stav}
              config={config}
              entries={pipelineByStav[stav] ?? []}
              readOnly={readOnly}
              dokumentacniMap={dokumentacniMap}
            />
          ))}
        </div>
      </section>
      <DragOverlay>
        {activeEntry && (
          <BrigadnikCardInner
            entry={activeEntry}
            isDragging
            dokumentacniStav={dokumentacniMap[activeEntry.brigadnik?.id ?? ""]}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}

function PipelineColumn({
  stav,
  config,
  entries,
  readOnly,
  dokumentacniMap,
}: {
  stav: string
  config: { label: string; color: string }
  entries: PipelineEntry[]
  readOnly: boolean
  dokumentacniMap: Record<string, string>
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `col:${stav}`, disabled: readOnly })

  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 min-h-[120px] rounded-lg p-2 transition-colors ${isOver ? "bg-primary/5 ring-2 ring-primary/20" : ""}`}
    >
      <div className="flex items-center gap-2 px-1">
        <Badge variant="outline" className={`${config.color} text-xs`}>
          {config.label}
        </Badge>
        <span className="text-xs text-muted-foreground">{entries.length}</span>
      </div>
      <div className="space-y-2">
        {entries.map(entry => (
          <DraggableBrigadnikCard
            key={entry.id}
            entry={entry}
            readOnly={readOnly}
            dokumentacniStav={dokumentacniMap[entry.brigadnik?.id ?? ""]}
          />
        ))}
        {entries.length === 0 && (
          <div className="border border-dashed rounded-lg p-3 text-center text-xs text-muted-foreground">
            Přetáhněte sem
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableBrigadnikCard({
  entry,
  readOnly,
  dokumentacniStav,
}: {
  entry: PipelineEntry
  readOnly: boolean
  dokumentacniStav?: string
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `brig:${entry.id}`,
    disabled: readOnly,
  })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`${readOnly ? "" : "cursor-grab active:cursor-grabbing"} ${isDragging ? "opacity-30" : ""}`}
    >
      <BrigadnikCardInner entry={entry} dokumentacniStav={dokumentacniStav} />
    </div>
  )
}

function BrigadnikCardInner({
  entry,
  isDragging,
  dokumentacniStav,
}: {
  entry: PipelineEntry
  isDragging?: boolean
  dokumentacniStav?: string
}) {
  const b = entry.brigadnik
  if (!b) return null

  const dppOk = entry.dpp_stav === "podepsano"
  const prohlaseniOk = entry.prohlaseni_stav === "podepsano"

  return (
    <Card className={isDragging ? "shadow-lg ring-2 ring-primary" : ""}>
      <CardContent className="p-3 space-y-2">
        <div>
          {/* Link nesmí volat stopPropagation na pointer eventech — blokovalo by drag listener na parent divu.
              Místo toho necháváme drag activationConstraint (distance: 8px) rozhodovat: krátký klik = navigace,
              drag 8+ px = přesun kanbanu. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <FakturantBadge typ={b.typ_brigadnika} variant="prefix" />
            <Link
              href={`/app/brigadnici/${b.id}`}
              className="font-medium text-sm hover:underline"
              onClick={(e) => { if (isDragging) e.preventDefault() }}
              draggable={false}
            >
              {b.prijmeni} {b.jmeno}
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">{b.telefon}</p>
        </div>
        {/* F-0015 enh + F-0016 post: dokumentační status editovatelný z pipeline karty. */}
        <div onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => ev.stopPropagation()}>
          <DokumentacniStavSelect
            brigadnikId={b.id}
            current={dokumentacniStav}
            ariaLabel={`${b.prijmeni} ${b.jmeno}`}
            compact
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {b.dotaznik_vyplnen ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]">
              Údaje
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">
              Bez údajů
            </Badge>
          )}
          {dppOk && (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]">DPP</Badge>
          )}
          {prohlaseniOk && (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]">Prohl.</Badge>
          )}
          {entry.avg_hodnoceni != null && entry.avg_hodnoceni > 0 && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">
              ⭐ {entry.avg_hodnoceni.toFixed(1)}
            </Badge>
          )}
          {entry.hodiny_ytd != null && entry.hodiny_ytd > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {entry.hodiny_ytd.toFixed(0)}h YTD
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ========== Assignment Matrix (fast phone-call UX) ==========

type MatrixOptimistic = {
  // key = `${brigadnikId}:${akceId}`, value = true/false (assigned)
  [key: string]: boolean
}

function AssignmentMatrix({
  pipeline,
  akce,
  readOnly,
  nabidkaTyp,
  dokumentacniMap,
}: {
  pipeline: PipelineEntry[]
  akce: AkceWithPrirazeni[]
  readOnly: boolean
  nabidkaTyp: string
  dokumentacniMap: Record<string, string>
}) {
  const eligible = useMemo(
    () => pipeline.filter(e => e.brigadnik && ELIGIBLE_STAVS.includes(e.stav)),
    [pipeline]
  )

  // Build initial assignment set from props
  const initialAssignments = useMemo(() => {
    const m: MatrixOptimistic = {}
    for (const a of akce) {
      for (const p of a.prirazeni) {
        if (p.status === "prirazeny") {
          m[`${p.brigadnik_id}:${a.id}`] = true
        }
      }
    }
    return m
  }, [akce])

  const [optimistic, setOptimisticState] = useOptimistic<MatrixOptimistic, { key: string; value: boolean }>(
    initialAssignments,
    (state, { key, value }) => ({ ...state, [key]: value })
  )

  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  function toggle(brigadnikId: string, akceId: string) {
    if (readOnly) return
    const key = `${brigadnikId}:${akceId}`
    const current = optimistic[key] ?? false
    const next = !current

    setPendingCells(prev => new Set(prev).add(key))
    startTransition(async () => {
      setOptimisticState({ key, value: next })
      const result = next
        ? await assignBrigadnikToAkce(akceId, brigadnikId)
        : await unassignBrigadnikFromAkce(akceId, brigadnikId)
      setPendingCells(prev => {
        const n = new Set(prev)
        n.delete(key)
        return n
      })
      if (result.error) {
        toast.error(result.error)
        // revert via re-render (optimistic state tied to server state, will sync on revalidation)
      } else if (!next) {
        toast.success("Odebráno z akce")
      } else {
        toast.success("Přiřazeno")
      }
    })
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium">
          Přiřazení na akce ({akce.length} {akce.length === 1 ? "akce" : akce.length < 5 ? "akce" : "akcí"})
        </h2>
      </div>

      {akce.length === 0 ? (
        <div className="border border-dashed rounded-xl p-8 text-center text-sm text-muted-foreground">
          {nabidkaTyp === "ukoncena"
            ? "Ukončená zakázka — read-only."
            : "Zatím žádná akce. Přidejte první akci tlačítkem nad stránkou."}
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 bg-card text-left font-medium px-3 py-3 min-w-[200px] border-r">
                  Brigádník
                </th>
                {akce.map(a => (
                  <AkceHeaderCell key={a.id} akce={a} optimistic={optimistic} eligible={eligible} readOnly={readOnly} />
                ))}
              </tr>
            </thead>
            <tbody>
              {eligible.length === 0 ? (
                <tr>
                  <td colSpan={akce.length + 1} className="text-center text-muted-foreground py-8 px-3 text-sm">
                    Žádný brigádník není ve stavu &bdquo;Přijatý&ldquo; pro přiřazení.
                    <br />
                    Posuňte v pipeline brigádníka do stavu <em>Přijatý — nehotová admin</em> nebo <em>Přijatý — vše vyřešeno</em>.
                  </td>
                </tr>
              ) : (
                eligible.map(e => {
                  const b = e.brigadnik!
                  const dppOk = e.dpp_stav === "podepsano"
                  const prohlaseniOk = e.prohlaseni_stav === "podepsano"
                  const dokStav = dokumentacniMap[b.id]
                  return (
                    <tr key={e.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="sticky left-0 bg-card group-hover:bg-muted/30 px-3 py-2 border-r">
                        {/* Row 1: Fakturant badge prefix + jméno */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <FakturantBadge typ={b.typ_brigadnika} variant="prefix" />
                          <Link href={`/app/brigadnici/${b.id}`} className="font-medium hover:underline">
                            {b.prijmeni} {b.jmeno}
                          </Link>
                        </div>

                        {/* Row 2: Telefon (vždy) */}
                        <p className="text-[11px] text-muted-foreground leading-tight">{b.telefon}</p>

                        {/* Rows 3-6 — desktop vždy viditelné, mobile collapse přes details. */}
                        <div className="hidden sm:block space-y-1 mt-1">
                          {/* Row 3: Dokumentační status (editovatelný) */}
                          <DokumentacniStavSelect
                            brigadnikId={b.id}
                            current={dokStav}
                            ariaLabel={`${b.prijmeni} ${b.jmeno}`}
                            compact
                          />
                          {/* Row 4: Pipeline poznámka popover */}
                          <div className="flex items-center gap-1">
                            <PipelineEntryPoznamkaPopover
                              entryId={e.id}
                              initialText={e.poznamky ?? null}
                            />
                            {dppOk && <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px] h-4">DPP</Badge>}
                            {prohlaseniOk && <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-[9px] h-4">Prohl.</Badge>}
                          </div>
                          {/* Row 5: Hodiny/rok */}
                          <div className="text-[10px] text-muted-foreground">
                            {e.hodiny_rok != null && e.hodiny_rok > 0
                              ? `${e.hodiny_rok.toFixed(0)} h / ${new Date().getFullYear()}`
                              : e.hodiny_ytd != null && e.hodiny_ytd > 0
                                ? `${e.hodiny_ytd.toFixed(0)} h`
                                : `0 h / ${new Date().getFullYear()}`}
                          </div>
                          {/* Row 6: Hodnocení */}
                          <StarRating value={e.avg_hodnoceni ?? 0} count={e.pocet_hodnoceni ?? undefined} />
                        </div>

                        {/* Mobile collapse: jen status indikátor poznámky + expand. */}
                        <details className="mt-1 sm:hidden">
                          <summary className="text-[10px] text-muted-foreground cursor-pointer select-none flex items-center gap-1">
                            <span>Více</span>
                            {e.poznamky && <span aria-label="Poznámka existuje">📝</span>}
                          </summary>
                          <div className="mt-1 space-y-1">
                            <DokumentacniStavSelect
                              brigadnikId={b.id}
                              current={dokStav}
                              ariaLabel={`${b.prijmeni} ${b.jmeno}`}
                              compact
                            />
                            <PipelineEntryPoznamkaPopover entryId={e.id} initialText={e.poznamky ?? null} />
                            <div className="text-[10px] text-muted-foreground">
                              {e.hodiny_rok != null && e.hodiny_rok > 0
                                ? `${e.hodiny_rok.toFixed(0)} h / ${new Date().getFullYear()}`
                                : `0 h / ${new Date().getFullYear()}`}
                            </div>
                            <StarRating value={e.avg_hodnoceni ?? 0} count={e.pocet_hodnoceni ?? undefined} />
                          </div>
                        </details>
                      </td>
                      {akce.map(a => {
                        const key = `${b.id}:${a.id}`
                        const assigned = optimistic[key] ?? false
                        const isPending = pendingCells.has(key)
                        return (
                          <td key={a.id} className="p-0 text-center border-r last:border-r-0">
                            <button
                              type="button"
                              onClick={() => toggle(b.id, a.id)}
                              disabled={readOnly || isPending}
                              aria-pressed={assigned}
                              aria-label={assigned ? `Odebrat ${b.prijmeni} ${b.jmeno} z akce ${a.nazev}` : `Přiřadit ${b.prijmeni} ${b.jmeno} na akci ${a.nazev}`}
                              className={`w-full h-full min-h-[56px] flex items-center justify-center transition-colors ${
                                readOnly
                                  ? "cursor-not-allowed opacity-40"
                                  : assigned
                                    ? "bg-green-500/15 hover:bg-green-500/25 cursor-pointer"
                                    : "hover:bg-muted/60 cursor-pointer"
                              }`}
                            >
                              {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : assigned ? (
                                <span className="text-green-600 font-bold text-lg">✓</span>
                              ) : (
                                <span className="text-muted-foreground/40 text-lg">·</span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

    </section>
  )
}

// ========== Akce header cell (sloupec = metadata akce) ==========

function AkceHeaderCell({
  akce,
  optimistic,
  eligible,
  readOnly,
}: {
  akce: AkceWithPrirazeni
  optimistic: MatrixOptimistic
  eligible: PipelineEntry[]
  readOnly: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [briefingOpen, setBriefingOpen] = useState(false)
  const [zrusitOpen, setZrusitOpen] = useState(false)
  const isZrusena = akce.stav === "zrusena"
  const isProbehla = akce.stav === "probehla"

  // Count assigned from optimistic state
  const assignedCount = eligible.reduce((sum, e) => {
    const key = `${e.brigadnik!.id}:${akce.id}`
    return sum + (optimistic[key] ? 1 : 0)
  }, 0)
  const kapacita = akce.pocet_lidi ?? 0

  const pinUrl = akce.pin_kod
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/dochazka/${akce.id}`
    : null

  function copyPin() {
    if (!akce.pin_kod) return
    navigator.clipboard.writeText(akce.pin_kod)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <th
      className={`text-left align-top font-normal px-3 py-2 min-w-[180px] border-r border-b-0 ${
        isZrusena ? "bg-[repeating-linear-gradient(45deg,_transparent_0_6px,_rgba(239,68,68,0.04)_6px_12px)] opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <Link
          href={`/app/akce/${akce.id}`}
          className={`block font-medium hover:underline ${isZrusena ? "line-through text-muted-foreground" : ""}`}
        >
          {akce.nazev}
        </Link>
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="Menu akce">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={`/app/akce/${akce.id}`} />}>
                Upravit / Detail
              </DropdownMenuItem>
              {akce.stav === "planovana" && (
                <DropdownMenuItem variant="destructive" onClick={() => setZrusitOpen(true)}>
                  <Ban className="h-4 w-4" />
                  Zrušit akci
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground mb-2">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(akce.datum).toLocaleDateString("cs-CZ")}
          {akce.cas_od && ` ${akce.cas_od.slice(0, 5)}`}
          {akce.cas_do && `—${akce.cas_do.slice(0, 5)}`}
        </span>
        {akce.misto && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {akce.misto}
          </span>
        )}
      </div>

      {/* Inline stav selector (F-0015 US-1E-2) */}
      {!readOnly && (
        <div className="mb-2">
          <AkceStavSelector
            akceId={akce.id}
            akceName={akce.nazev}
            akceDate={akce.datum}
            currentStav={akce.stav ?? "planovana"}
            size="sm"
          />
        </div>
      )}

      {/* ZrusitAkciDialog z menu */}
      <ZrusitAkciDialog
        open={zrusitOpen}
        onOpenChange={setZrusitOpen}
        akceId={akce.id}
        akceName={akce.nazev}
        akceDate={akce.datum}
      />

      {/* Kapacita progress */}
      <div className={`mb-2 ${isProbehla ? "opacity-70" : ""}`}>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
          <span>Obsazenost</span>
          <span className="tabular-nums">{assignedCount}{kapacita > 0 ? `/${kapacita}` : ""}</span>
        </div>
        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${kapacita > 0 && assignedCount >= kapacita ? "bg-green-500" : "bg-blue-500"}`}
            style={{ width: kapacita > 0 ? `${Math.min(100, (assignedCount / kapacita) * 100)}%` : `${assignedCount > 0 ? 50 : 0}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-1">
        {pinUrl && (
          <Link href={`/dochazka/${akce.id}`} target="_blank" rel="noopener">
            <Button variant="outline" size="sm" className="text-[10px] h-6 px-2">
              <ClipboardList className="h-3 w-3 mr-1" />
              Docházka
            </Button>
          </Link>
        )}
        {akce.pin_kod && (
          <Button variant="outline" size="sm" className="text-[10px] h-6 px-2 tabular-nums" onClick={copyPin} title="Kliknutím zkopírujete PIN">
            <Copy className="h-3 w-3 mr-1" />
            {copied ? "Zkopírováno" : akce.pin_kod}
          </Button>
        )}
        {!readOnly && assignedCount > 0 && (
          <BriefingButton akceId={akce.id} open={briefingOpen} onOpenChange={setBriefingOpen} />
        )}
      </div>
    </th>
  )
}

// ========== Briefing dialog ==========

function BriefingButton({
  akceId,
  open,
  onOpenChange,
}: {
  akceId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [text, setText] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSend() {
    startTransition(async () => {
      const result = await odeslatBriefing(akceId, text)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(result.warning ?? `Briefing odeslán${result.sent ? ` (${result.sent})` : ""}`)
        onOpenChange(false)
        setText("")
      }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => onOpenChange(true)}>
        <Send className="h-3 w-3 mr-1" />
        Brief.
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => onOpenChange(false)}>
          <div className="bg-background rounded-lg p-6 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Odeslat briefing</h3>
            <p className="text-sm text-muted-foreground">
              Odešle email všem přiřazeným brigádníkům. Můžete doplnit vlastní text:
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Doplňující instrukce pro brigádníky..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Zrušit</Button>
              <Button onClick={handleSend} disabled={isPending}>
                {isPending ? "Odesílám..." : "Odeslat"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
