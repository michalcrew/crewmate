import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getNabidkaById } from "@/lib/actions/nabidky"
import { getPipelineByNabidka } from "@/lib/actions/pipeline"
import { PipelineBoard } from "@/components/pipeline/pipeline-board"
import { PIPELINE_STATES } from "@/lib/constants"
import { EditNabidkaDialog } from "@/components/nabidky/edit-nabidka-dialog"
import { AddToPipelineDialog } from "@/components/pipeline/add-to-pipeline-dialog"
import { getBrigadnici } from "@/lib/actions/brigadnici"

export const metadata: Metadata = {
  title: "Detail nabídky",
}

export default async function NabidkaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const nabidka = await getNabidkaById(id)
  if (!nabidka) notFound()

  const [pipeline, allBrigadnici] = await Promise.all([
    getPipelineByNabidka(id),
    getBrigadnici(),
  ])
  const pipelineIds = new Set(pipeline.map(p => (p.brigadnik as unknown as { id: string })?.id))
  const availableBrigadnici = (allBrigadnici ?? [])
    .filter(b => !pipelineIds.has(b.id))
    .map(b => ({ id: b.id, jmeno: b.jmeno, prijmeni: b.prijmeni, telefon: b.telefon, email: b.email }))

  const pipelineByStav = Object.keys(PIPELINE_STATES).reduce(
    (acc, stav) => {
      acc[stav] = pipeline.filter((e) => e.stav === stav)
      return acc
    },
    {} as Record<string, typeof pipeline>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/nabidky">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" /><span className="sr-only">Zpět</span>
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{nabidka.nazev}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">
              {nabidka.typ === "prubezna" ? "Průběžná" : "Jednorázová"}
            </Badge>
            {nabidka.klient && (
              <span className="text-sm text-muted-foreground">{nabidka.klient}</span>
            )}
            {nabidka.misto && (
              <span className="text-sm text-muted-foreground">| {nabidka.misto}</span>
            )}
            {nabidka.odmena && (
              <span className="text-sm text-muted-foreground">| {nabidka.odmena}</span>
            )}
          </div>
        </div>
        <div className="ml-auto">
          <EditNabidkaDialog nabidka={nabidka} />
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">
            Pipeline ({pipeline.length} brigádník{pipeline.length === 1 ? "" : pipeline.length < 5 ? "i" : "ů"})
          </h2>
          <AddToPipelineDialog nabidkaId={id} brigadnici={availableBrigadnici} />
        </div>
        <PipelineBoard
          nabidkaId={id}
          pipelineByStav={pipelineByStav}
        />
      </div>

      {(nabidka.popis_prace || nabidka.pozadavky) && (
        <Card>
          <CardHeader>
            <CardTitle>Detail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {nabidka.popis_prace && (
              <div>
                <span className="text-muted-foreground">Popis práce:</span>
                <p className="mt-1">{nabidka.popis_prace}</p>
              </div>
            )}
            {nabidka.pozadavky && (
              <div>
                <span className="text-muted-foreground">Požadavky:</span>
                <p className="mt-1">{nabidka.pozadavky}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
