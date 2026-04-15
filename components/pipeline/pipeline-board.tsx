"use client"

import { useTransition } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Object.entries(PIPELINE_STATES).map(([stav, config]) => (
        <div key={stav} className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${config.color} text-xs`}>
              {config.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {pipelineByStav[stav]?.length ?? 0}
            </span>
          </div>
          <div className="space-y-2">
            {(pipelineByStav[stav] ?? []).map((entry) => (
              <PipelineCard
                key={entry.id}
                entry={entry}
                nabidkaId={nabidkaId}
                currentStav={stav}
              />
            ))}
            {(pipelineByStav[stav]?.length ?? 0) === 0 && (
              <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                Prázdné
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function PipelineCard({
  entry,
  nabidkaId,
  currentStav,
}: {
  entry: PipelineEntry
  nabidkaId: string
  currentStav: string
}) {
  const [isPending, startTransition] = useTransition()
  const b = entry.brigadnik

  if (!b) return null

  function handleStavChange(newStav: string | null) {
    if (!newStav) return
    startTransition(async () => {
      await updatePipelineStav(entry.id, newStav, nabidkaId)
    })
  }

  return (
    <Card className={isPending ? "opacity-50" : ""}>
      <CardContent className="p-3 space-y-2">
        <div>
          <Link
            href={`/app/brigadnici/${b.id}`}
            className="font-medium text-sm hover:underline"
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
        <Select value={currentStav} onValueChange={handleStavChange}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PIPELINE_STATES).map(([s, c]) => (
              <SelectItem key={s} value={s} className="text-xs">
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}
