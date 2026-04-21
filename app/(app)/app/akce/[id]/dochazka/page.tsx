import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Calendar, Clock, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getAkceDochazkaForAdmin } from "@/lib/actions/dochazka"
import { DochazkaGridV2 } from "@/components/dochazka/dochazka-grid-v2"
import { ExportDochazkaButton } from "@/components/dochazka/export-dochazka-button"
import type { DochazkaRowEntry } from "@/components/dochazka/dochazka-row"
import type { DokumentacniStav } from "@/components/brigadnici/dokumentacni-stav-badge"

export const metadata: Metadata = { title: "Docházka akce (admin)" }

type RawEntry = {
  id: string
  status: string
  brigadnik: {
    id: string
    jmeno: string
    prijmeni: string
    typ_brigadnika?: string | null
  } | null
  dochazka: Array<{
    id: string
    prichod: string | null
    odchod: string | null
    hodnoceni: number | null
    poznamka: string | null
  }>
  dokumentacni_stav: string | null
}

function mapEntries(entries: RawEntry[]): DochazkaRowEntry[] {
  return entries
    .filter((e) => !!e.brigadnik)
    .map((e) => {
      const d = e.dochazka?.[0]
      return {
        prirazeniId: e.id,
        brigadnik: {
          id: e.brigadnik!.id,
          jmeno: e.brigadnik!.jmeno,
          prijmeni: e.brigadnik!.prijmeni,
          telefon: null,
        },
        status: e.status,
        dochazka: d
          ? {
              id: d.id,
              prichod: d.prichod,
              odchod: d.odchod,
              hodnoceni: d.hodnoceni,
              poznamka: d.poznamka,
            }
          : null,
        dokumentacniStav: (e.dokumentacni_stav as DokumentacniStav) ?? null,
      }
    })
}

const STAV_LABEL: Record<string, { label: string; cls: string }> = {
  planovana: { label: "Plánovaná", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  probehla: { label: "Proběhlá", cls: "bg-green-500/10 text-green-600 border-green-500/20" },
  zrusena: { label: "Zrušená", cls: "bg-red-500/10 text-red-600 border-red-500/20" },
}

export default async function AdminDochazkaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getAkceDochazkaForAdmin(id)

  if ("error" in result) {
    redirect(`/app/akce/${id}`)
  }

  const { akce, entries, internalUserId } = result
  const mapped = mapEntries(entries as unknown as RawEntry[])
  const stav = (akce.stav ?? "planovana") as keyof typeof STAV_LABEL
  const stavCfg = STAV_LABEL[stav] ?? { label: "Plánovaná", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" }
  const defaultMesic = akce.datum ? akce.datum.slice(0, 7) : undefined

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <Link href={`/app/akce/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
            <span className="sr-only">Zpět na detail akce</span>
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold truncate">{akce.nazev}</h1>
            <Badge variant="outline" className={stavCfg.cls}>
              {stavCfg.label}
            </Badge>
            <Badge variant="outline">Admin pohled</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(akce.datum).toLocaleDateString("cs-CZ")}
            </span>
            {akce.cas_od && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {akce.cas_od.slice(0, 5)}
                {akce.cas_do ? ` — ${akce.cas_do.slice(0, 5)}` : ""}
              </span>
            )}
            {akce.misto && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {akce.misto}
              </span>
            )}
          </div>
        </div>
        <ExportDochazkaButton defaultMesic={defaultMesic} />
      </div>

      {stav === "zrusena" && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Akce je <strong>zrušená</strong>. Docházka je přístupná jen pro historické záznamy.
        </div>
      )}

      <DochazkaGridV2
        akceId={id}
        editor={{ type: "admin", id: internalUserId }}
        entries={mapped}
      />
    </div>
  )
}
