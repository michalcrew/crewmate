import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getNabidkaById } from "@/lib/actions/nabidky"
import { getPipelineByNabidka } from "@/lib/actions/pipeline"
import { getAkceByNabidka, getMatrixDokumentacniStatus } from "@/lib/actions/akce"
import { getBrigadnici } from "@/lib/actions/brigadnici"
import { createClient } from "@/lib/supabase/server"
import { TypBadge } from "@/components/nabidky/typ-badge"
import { PublishToggle } from "@/components/nabidky/publish-toggle"
import { EditNabidkaDialog } from "@/components/nabidky/edit-nabidka-dialog"
import { AddToPipelineDialog } from "@/components/pipeline/add-to-pipeline-dialog"
import { AddAkceDialog } from "@/components/nabidky/detail/add-akce-dialog"
import { UkoncitButton } from "@/components/nabidky/detail/ukoncit-button"
import { ZobrazitNabidkuButton } from "@/components/nabidky/zobrazit-nabidku-button"
import {
  NabidkaDetailClient,
  type PipelineEntry as ClientPipelineEntry,
  type AkceWithPrirazeni,
} from "@/components/nabidky/detail/detail-client"

export const metadata: Metadata = {
  title: "Detail zakázky",
}

async function enrichPipeline(
  pipeline: Awaited<ReturnType<typeof getPipelineByNabidka>>
): Promise<ClientPipelineEntry[]> {
  if (pipeline.length === 0) return []
  const supabase = await createClient()
  const brigIds = [...new Set(pipeline.map(p => (p.brigadnik as unknown as { id: string } | null)?.id).filter(Boolean))] as string[]

  // F-0013: per-rok smluvni_stav (aktuální rok)
  const rok = new Date().getFullYear()
  const { data: smluvni } = await supabase
    .from("smluvni_stav")
    .select("brigadnik_id, dpp_stav, prohlaseni_stav")
    .in("brigadnik_id", brigIds)
    .eq("rok", rok)

  const smluvniMap = new Map<string, { dpp_stav: string; prohlaseni_stav: string }>()
  for (const s of smluvni ?? []) {
    smluvniMap.set(s.brigadnik_id, { dpp_stav: s.dpp_stav, prohlaseni_stav: s.prohlaseni_stav })
  }

  // YTD hours + avg rating
  const yearStart = `${new Date().getFullYear()}-01-01`
  const { data: dochazka } = await supabase
    .from("dochazka")
    .select("brigadnik_id, hodin_celkem, hodnoceni, created_at")
    .in("brigadnik_id", brigIds)
    .gte("created_at", yearStart)

  const statsMap = new Map<string, { hours: number; ratingSum: number; ratingCount: number }>()
  for (const d of dochazka ?? []) {
    const s = statsMap.get(d.brigadnik_id) ?? { hours: 0, ratingSum: 0, ratingCount: 0 }
    s.hours += Number(d.hodin_celkem) || 0
    if (d.hodnoceni != null) {
      s.ratingSum += d.hodnoceni
      s.ratingCount += 1
    }
    statsMap.set(d.brigadnik_id, s)
  }

  return pipeline.map(p => {
    const b = p.brigadnik as unknown as ClientPipelineEntry["brigadnik"]
    const bid = b?.id
    const sm = bid ? smluvniMap.get(bid) : undefined
    const st = bid ? statsMap.get(bid) : undefined
    return {
      id: p.id,
      stav: p.stav,
      brigadnik: b ?? null,
      naborar: p.naborar ?? null,
      dpp_stav: sm?.dpp_stav ?? null,
      prohlaseni_stav: sm?.prohlaseni_stav ?? null,
      hodiny_ytd: st?.hours,
      avg_hodnoceni: st && st.ratingCount > 0 ? st.ratingSum / st.ratingCount : null,
    }
  })
}

export default async function NabidkaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const nabidka = await getNabidkaById(id)
  if (!nabidka) notFound()

  let pipeline: Awaited<ReturnType<typeof getPipelineByNabidka>> = []
  let allBrigadnici: Awaited<ReturnType<typeof getBrigadnici>> = []
  let akceRaw: Awaited<ReturnType<typeof getAkceByNabidka>> = []

  try {
    ;[pipeline, allBrigadnici, akceRaw] = await Promise.all([
      getPipelineByNabidka(id),
      getBrigadnici(),
      getAkceByNabidka(id),
    ])
  } catch {
    // graceful fallback
  }

  const [enrichedPipeline, dokumentacniMap] = await Promise.all([
    enrichPipeline(pipeline),
    getMatrixDokumentacniStatus(id),
  ])

  const pipelineIds = new Set(
    (pipeline as Array<{ brigadnik: { id: string } | null }>).map(p => p.brigadnik?.id).filter(Boolean)
  )
  const availableBrigadnici = (allBrigadnici ?? [])
    .filter(b => !pipelineIds.has(b.id))
    .map(b => ({ id: b.id, jmeno: b.jmeno, prijmeni: b.prijmeni, telefon: b.telefon, email: b.email }))

  const akce: AkceWithPrirazeni[] = (akceRaw ?? []).map(a => ({
    id: a.id,
    nazev: a.nazev,
    datum: a.datum,
    cas_od: a.cas_od ?? null,
    cas_do: a.cas_do ?? null,
    misto: a.misto ?? null,
    pocet_lidi: a.pocet_lidi ?? null,
    pin_kod: a.pin_kod ?? null,
    stav: a.stav ?? "planovana",
    prirazeni: (a.prirazeni ?? []) as AkceWithPrirazeni["prirazeni"],
  }))

  const isUkoncena = nabidka.typ === "ukoncena"
  const isOpakovana = nabidka.typ === "opakovana"

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <Link href="/app/nabidky">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" /><span className="sr-only">Zpět</span>
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold">{nabidka.nazev}</h1>
            <TypBadge typ={nabidka.typ} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {nabidka.klient && <span>{nabidka.klient}</span>}
            {nabidka.misto && <span>· {nabidka.misto}</span>}
            {nabidka.odmena && <span>· {nabidka.odmena}</span>}
            {isUkoncena && <span className="text-amber-600 font-medium">· Ukončeno</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Publikováno:</span>
            <PublishToggle id={nabidka.id} publikovano={nabidka.publikovano} typ={nabidka.typ} />
          </div>
          <EditNabidkaDialog
            nabidka={nabidka}
            akce={
              nabidka.typ === "jednodenni" && akce.length > 0 && akce[0]
                ? {
                    id: akce[0].id,
                    datum: akce[0].datum,
                    misto: akce[0].misto,
                    cas_od: akce[0].cas_od,
                    cas_do: akce[0].cas_do,
                    pocet_lidi: akce[0].pocet_lidi,
                  }
                : null
            }
          />
          <ZobrazitNabidkuButton
            slug={nabidka.slug}
            publikovano={nabidka.publikovano}
            variant="inline"
          />
          {!isUkoncena && <UkoncitButton id={nabidka.id} nazev={nabidka.nazev} />}
        </div>
      </div>

      {/* Top-action toolbar */}
      {!isUkoncena && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <AddToPipelineDialog nabidkaId={id} brigadnici={availableBrigadnici} />
          {/* Opakovaná: libovolný počet akcí přidáváme tady.
              Jednodenní: 1 akce se upsertuje v nastavení zakázky (datum akce). */}
          {isOpakovana && (
            <AddAkceDialog
              nabidkaId={id}
              defaultNazev={nabidka.nazev}
              defaultMisto={nabidka.misto ?? undefined}
              defaultKlient={nabidka.klient ?? undefined}
            />
          )}
        </div>
      )}

      {/* Pipeline + Akce */}
      <NabidkaDetailClient
        nabidkaId={id}
        nabidkaTyp={nabidka.typ}
        pipeline={enrichedPipeline}
        akce={akce}
        readOnly={isUkoncena}
        dokumentacniMap={dokumentacniMap}
      />

      {(nabidka.popis_prace || nabidka.pozadavky || nabidka.koho_hledame || nabidka.co_nabizime) && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Detail zakázky</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {nabidka.popis_prace && (
              <div>
                <span className="text-muted-foreground">Popis práce:</span>
                <p className="mt-1 whitespace-pre-wrap">{nabidka.popis_prace}</p>
              </div>
            )}
            {nabidka.koho_hledame && (
              <div>
                <span className="text-muted-foreground">Koho hledáme:</span>
                <p className="mt-1 whitespace-pre-wrap">{nabidka.koho_hledame}</p>
              </div>
            )}
            {nabidka.pozadavky && (
              <div>
                <span className="text-muted-foreground">Požadavky:</span>
                <p className="mt-1 whitespace-pre-wrap">{nabidka.pozadavky}</p>
              </div>
            )}
            {nabidka.co_nabizime && (
              <div>
                <span className="text-muted-foreground">Co nabízíme:</span>
                <p className="mt-1 whitespace-pre-wrap">{nabidka.co_nabizime}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
