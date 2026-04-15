"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { updatePipelineStav } from "@/lib/actions/pipeline"
import { PIPELINE_STATES } from "@/lib/constants"

type PipelineEntry = {
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
  naborar: {
    jmeno: string
    prijmeni: string
  } | null
}

export function PipelineBoard({
  nabidkaId,
  pipelineByStav,
}: {
  nabidkaId: string
  pipelineByStav: Record<string, PipelineEntry[]>
}) {
  const [activeEntry, setActiveEntry] = useState<PipelineEntry | null>(null)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function handleDragStart(event: DragStartEvent) {
    const entry = Object.values(pipelineByStav).flat().find(e => e.id === event.active.id)
    setActiveEntry(entry ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveEntry(null)
    const { active, over } = event
    if (!over) return

    const entryId = active.id as string
    const newStav = over.id as string

    // Find current stav
    const currentStav = Object.entries(pipelineByStav).find(([, entries]) =>
      entries.some(e => e.id === entryId)
    )?.[0]

    if (currentStav === newStav) return

    const stavLabel = Object.entries(PIPELINE_STATES).find(([k]) => k === newStav)?.[1]?.label ?? newStav
    startTransition(async () => {
      const result = await updatePipelineStav(entryId, newStav, nabidkaId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Stav změněn na: ${stavLabel}`)
      }
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 ${isPending ? "opacity-60" : ""}`}>
        {Object.entries(PIPELINE_STATES).map(([stav, config]) => (
          <DroppableColumn key={stav} stav={stav} config={config} entries={pipelineByStav[stav] ?? []} nabidkaId={nabidkaId} />
        ))}
      </div>
      <DragOverlay>
        {activeEntry && <PipelineCardContent entry={activeEntry} isDragging nabidkaId="" />}
      </DragOverlay>
    </DndContext>
  )
}

function DroppableColumn({
  stav,
  config,
  entries,
  nabidkaId,
}: {
  stav: string
  config: { label: string; color: string }
  entries: PipelineEntry[]
  nabidkaId: string
}) {
  const { isOver, setNodeRef } = useDroppable({ id: stav })

  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 min-h-[100px] rounded-lg p-2 transition-colors ${isOver ? "bg-primary/5 ring-2 ring-primary/20" : ""}`}
    >
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`${config.color} text-xs`}>
          {config.label}
        </Badge>
        <span className="text-xs text-muted-foreground">{entries.length}</span>
      </div>
      <div className="space-y-2">
        {entries.map((entry) => (
          <DraggableCard key={entry.id} entry={entry} nabidkaId={nabidkaId} />
        ))}
        {entries.length === 0 && (
          <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
            Přetáhněte sem
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ entry, nabidkaId }: { entry: PipelineEntry; nabidkaId: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
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
      className={`cursor-grab active:cursor-grabbing ${isDragging ? "opacity-30" : ""}`}
    >
      <PipelineCardContent entry={entry} nabidkaId={nabidkaId} />
    </div>
  )
}

function MobileStateSelect({ entry, nabidkaId }: { entry: PipelineEntry; nabidkaId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStav = e.target.value
    if (newStav === entry.stav) return
    const stavLabel = PIPELINE_STATES[newStav as keyof typeof PIPELINE_STATES]?.label ?? newStav
    startTransition(async () => {
      const result = await updatePipelineStav(entry.id, newStav, nabidkaId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Stav změněn na: ${stavLabel}`)
      }
    })
  }

  return (
    <select
      value={entry.stav}
      onChange={handleChange}
      disabled={isPending}
      className="md:hidden w-full mt-1 text-xs rounded border border-input bg-background px-2 py-1"
    >
      {Object.entries(PIPELINE_STATES).map(([k, v]) => (
        <option key={k} value={k}>{v.label}</option>
      ))}
    </select>
  )
}

function PipelineCardContent({ entry, isDragging, nabidkaId }: { entry: PipelineEntry; isDragging?: boolean; nabidkaId?: string }) {
  const b = entry.brigadnik
  if (!b) return null

  return (
    <Card className={`${isDragging ? "shadow-lg ring-2 ring-primary" : ""}`}>
      <CardContent className="p-3 space-y-2">
        <div>
          <Link
            href={`/app/brigadnici/${b.id}`}
            className="font-medium text-sm hover:underline"
            onClick={(e) => isDragging && e.preventDefault()}
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
          {entry.naborar && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
              {(entry.naborar as unknown as { jmeno: string; prijmeni: string }).jmeno} {(entry.naborar as unknown as { jmeno: string; prijmeni: string }).prijmeni?.charAt(0)}.
            </Badge>
          )}
        </div>
        {/* Mobile fallback: select dropdown instead of D&D */}
        {nabidkaId && <MobileStateSelect entry={entry} nabidkaId={nabidkaId} />}
      </CardContent>
    </Card>
  )
}
