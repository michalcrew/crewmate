"use client"

import { useState, useTransition } from "react"
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
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, MapPin, Users, Copy, Send, Trash2, X, ClipboardList } from "lucide-react"
import { PIPELINE_STATES } from "@/lib/constants"
import { updatePipelineStav } from "@/lib/actions/pipeline"
import { assignBrigadnikToAkce, unassignBrigadnikFromAkce, odeslatBriefing } from "@/lib/actions/akce"

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
  } | null
  naborar: { jmeno: string; prijmeni: string } | null
  // F-0012 enrichment
  dpp_stav?: string | null
  prohlaseni_stav?: string | null
  hodiny_ytd?: number
  avg_hodnoceni?: number | null
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

// ========== Main component ==========

export function NabidkaDetailClient({
  nabidkaId,
  nabidkaTyp,
  pipeline,
  akce,
  readOnly,
}: {
  nabidkaId: string
  nabidkaTyp: string
  pipeline: PipelineEntry[]
  akce: AkceWithPrirazeni[]
  readOnly: boolean
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
    if (!id.startsWith("brig:")) return
    const entryId = id.slice(5)
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
    if (!activeId.startsWith("brig:")) return

    const entryId = activeId.slice(5)
    const entry = pipeline.find(e => e.id === entryId)
    if (!entry || !entry.brigadnik) return

    // Target: pipeline column
    if (overId.startsWith("col:")) {
      const newStav = overId.slice(4)
      if (entry.stav === newStav) return
      const stavLabel = PIPELINE_STATES[newStav as keyof typeof PIPELINE_STATES]?.label ?? newStav
      startTransition(async () => {
        const result = await updatePipelineStav(entry.id, newStav, nabidkaId)
        if (result.error) toast.error(result.error)
        else toast.success(`Stav změněn na: ${stavLabel}`)
      })
      return
    }

    // Target: akce card
    if (overId.startsWith("akce:")) {
      const akceId = overId.slice(5)
      const targetAkce = akce.find(a => a.id === akceId)
      if (!targetAkce) return
      // Guard client-side (server also guards)
      if (!["prijaty_nehotova_admin", "prijaty_vse_vyreseno"].includes(entry.stav)) {
        toast.error("Brigádník musí být ve stavu 'Přijatý' pro přiřazení na akci")
        return
      }
      startTransition(async () => {
        const result = await assignBrigadnikToAkce(akceId, entry.brigadnik!.id)
        if (result.error) toast.error(result.error)
        else toast.success(`${entry.brigadnik!.prijmeni} ${entry.brigadnik!.jmeno} přiřazen/a na ${targetAkce.nazev}`)
      })
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
        {/* Pipeline section */}
        <section className="mb-8">
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
              />
            ))}
          </div>
        </section>

        {/* Akce section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">
              Akce ({akce.length})
            </h2>
          </div>
          {akce.length === 0 ? (
            <div className="border border-dashed rounded-xl p-8 text-center text-sm text-muted-foreground">
              {nabidkaTyp === "opakovana"
                ? "Zatím žádná akce. Přidejte první akci pomocí tlačítka nad sekcí."
                : nabidkaTyp === "jednodenni"
                  ? "Jednodenní zakázka nemá akci. Vytvořte si novou jednodenní zakázku."
                  : "Žádná akce."}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {akce.map(a => (
                <AkceCard key={a.id} akce={a} readOnly={readOnly} nabidkaId={nabidkaId} />
              ))}
            </div>
          )}
        </section>
      </div>

      <DragOverlay>
        {activeEntry && <BrigadnikCardInner entry={activeEntry} isDragging />}
      </DragOverlay>
    </DndContext>
  )
}

// ========== Pipeline column (droppable) ==========

function PipelineColumn({
  stav,
  config,
  entries,
  readOnly,
}: {
  stav: string
  config: { label: string; color: string }
  entries: PipelineEntry[]
  readOnly: boolean
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
          <DraggableBrigadnikCard key={entry.id} entry={entry} readOnly={readOnly} />
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

function DraggableBrigadnikCard({ entry, readOnly }: { entry: PipelineEntry; readOnly: boolean }) {
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
      <BrigadnikCardInner entry={entry} />
    </div>
  )
}

function BrigadnikCardInner({ entry, isDragging }: { entry: PipelineEntry; isDragging?: boolean }) {
  const b = entry.brigadnik
  if (!b) return null

  const dppOk = entry.dpp_stav === "podepsano"
  const prohlaseniOk = entry.prohlaseni_stav === "podepsano"

  return (
    <Card className={isDragging ? "shadow-lg ring-2 ring-primary" : ""}>
      <CardContent className="p-3 space-y-2">
        <div>
          <Link
            href={`/app/brigadnici/${b.id}`}
            className="font-medium text-sm hover:underline"
            onClick={(e) => isDragging && e.preventDefault()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {b.prijmeni} {b.jmeno}
          </Link>
          <p className="text-xs text-muted-foreground">{b.telefon}</p>
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

// ========== Akce card (droppable) ==========

function AkceCard({ akce, readOnly }: { akce: AkceWithPrirazeni; readOnly: boolean; nabidkaId: string }) {
  const { isOver, setNodeRef } = useDroppable({ id: `akce:${akce.id}`, disabled: readOnly })
  const [copied, setCopied] = useState(false)
  const [briefingOpen, setBriefingOpen] = useState(false)

  const prirazeniCount = akce.prirazeni.filter(p => p.status === "prirazeny").length
  const kapacita = akce.pocet_lidi ?? 0

  const pinUrl = akce.pin_kod
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/dochazka/${akce.id}`
    : null

  function copyPinLink() {
    if (!pinUrl) return
    navigator.clipboard.writeText(`${pinUrl} (PIN: ${akce.pin_kod})`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div ref={setNodeRef} className={`rounded-xl transition-colors ${isOver ? "ring-2 ring-primary bg-primary/5" : ""}`}>
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-medium">{akce.nazev}</h3>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
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
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {prirazeniCount}{kapacita > 0 ? `/${kapacita}` : ""}
              </span>
            </div>
          </div>
          <Link href={`/app/akce/${akce.id}`}>
            <Button variant="ghost" size="sm" className="text-xs h-7">Detail</Button>
          </Link>
        </div>

        {kapacita > 0 && (
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${prirazeniCount >= kapacita ? "bg-green-500" : "bg-blue-500"}`}
              style={{ width: `${Math.min(100, (prirazeniCount / kapacita) * 100)}%` }}
            />
          </div>
        )}

        {akce.prirazeni.length > 0 && (
          <div className="space-y-1 pt-1 border-t">
            {akce.prirazeni.map(p => (
              <PrirazeniRow
                key={p.id}
                akceId={akce.id}
                brigadnikId={p.brigadnik_id}
                jmeno={`${p.brigadnik?.prijmeni ?? ""} ${p.brigadnik?.jmeno ?? ""}`.trim() || "—"}
                status={p.status}
                pozice={p.pozice}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
          {pinUrl && (
            <>
              <Link href={`/dochazka/${akce.id}`} target="_blank" rel="noopener">
                <Button variant="outline" size="sm" className="text-xs h-7">
                  <ClipboardList className="h-3 w-3 mr-1" />
                  Docházka
                </Button>
              </Link>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={copyPinLink}>
                <Copy className="h-3 w-3 mr-1" />
                {copied ? "Zkopírováno!" : `PIN ${akce.pin_kod}`}
              </Button>
            </>
          )}
          {!readOnly && prirazeniCount > 0 && (
            <BriefingButton
              akceId={akce.id}
              open={briefingOpen}
              onOpenChange={setBriefingOpen}
            />
          )}
        </div>
      </CardContent>
    </Card>
    </div>
  )
}

function PrirazeniRow({
  akceId,
  brigadnikId,
  jmeno,
  status,
  pozice,
  readOnly,
}: {
  akceId: string
  brigadnikId: string
  jmeno: string
  status: string
  pozice: string | null
  readOnly: boolean
}) {
  const [isPending, startTransition] = useTransition()

  function handleUnassign() {
    if (readOnly) return
    startTransition(async () => {
      const result = await unassignBrigadnikFromAkce(akceId, brigadnikId)
      if (result.error) toast.error(result.error)
      else toast.success("Odebráno")
    })
  }

  return (
    <div className="flex items-center justify-between text-xs group">
      <div className="flex items-center gap-2">
        <span className="font-medium">{jmeno}</span>
        {pozice && <span className="text-muted-foreground">· {pozice}</span>}
        {status !== "prirazeny" && (
          <Badge variant="outline" className="text-[9px] h-4">{status}</Badge>
        )}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={handleUnassign}
          disabled={isPending}
          title="Odebrat z akce"
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

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
      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => onOpenChange(true)}>
        <Send className="h-3 w-3 mr-1" />
        Odeslat briefing
      </Button>
      {open && (
        <div className="absolute inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => onOpenChange(false)}>
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

// Suppress unused import warning (Trash2 reserved for future use)
void Trash2
