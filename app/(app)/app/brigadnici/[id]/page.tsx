import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getBrigadnikById,
  getBrigadnikPipeline,
  getBrigadnikSmluvniStav,
  getBrigadnikHistorie,
} from "@/lib/actions/brigadnici"
import { PIPELINE_STATES, DPP_STATES } from "@/lib/constants"
import { SendDotaznikButton } from "@/components/brigadnici/send-dotaznik-button"
import { GenerateDppButton, SendDppButton, UploadPodpisForm } from "@/components/brigadnici/dpp-actions"
import { EditBrigadnikDialog } from "@/components/brigadnici/edit-brigadnik-dialog"

export const metadata: Metadata = {
  title: "Detail brigádníka",
}

export default async function BrigadnikDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const brigadnik = await getBrigadnikById(id)
  if (!brigadnik) notFound()

  const [pipeline, smluvniStav, historie] = await Promise.all([
    getBrigadnikPipeline(id),
    getBrigadnikSmluvniStav(id),
    getBrigadnikHistorie(id),
  ])

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/brigadnici">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" /><span className="sr-only">Zpět</span>
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">
            {brigadnik.jmeno} {brigadnik.prijmeni}
          </h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span>{brigadnik.email}</span>
            <span>|</span>
            <span>{brigadnik.telefon}</span>
            {brigadnik.zdroj && (
              <>
                <span>|</span>
                <Badge variant="outline" className="text-xs">{brigadnik.zdroj}</Badge>
              </>
            )}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <EditBrigadnikDialog brigadnik={brigadnik} />
          {!brigadnik.dotaznik_vyplnen && (
            <SendDotaznikButton brigadnikId={brigadnik.id} />
          )}
        </div>
      </div>

      <Tabs defaultValue="prehled">
        <TabsList>
          <TabsTrigger value="prehled">Přehled</TabsTrigger>
          <TabsTrigger value="udaje">Osobní údaje</TabsTrigger>
          <TabsTrigger value="smluvni">Smluvní stav</TabsTrigger>
          <TabsTrigger value="historie">Historie</TabsTrigger>
        </TabsList>

        <TabsContent value="prehled" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              {pipeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Není v žádné pipeline.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nabídka</TableHead>
                      <TableHead>Stav</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pipeline.map((p) => {
                      const stavConfig = PIPELINE_STATES[p.stav as keyof typeof PIPELINE_STATES]
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <Link href={`/app/nabidky/${(p.nabidka as { id: string })?.id}`} className="hover:underline">
                              {(p.nabidka as { nazev: string })?.nazev}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`${stavConfig?.color ?? ""} text-xs`}>
                              {stavConfig?.label ?? p.stav}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {brigadnik.poznamky && (
            <Card>
              <CardHeader><CardTitle>Poznámky</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{brigadnik.poznamky}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="udaje" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Osobní údaje
                {brigadnik.dotaznik_vyplnen ? (
                  <Badge variant="outline" className="ml-2 bg-green-500/10 text-green-500 border-green-500/20 text-xs">
                    Dotazník vyplněn
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-2 bg-red-500/10 text-red-500 border-red-500/20 text-xs">
                    Dotazník nevyplněn
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ["Datum narození", brigadnik.datum_narozeni],
                  ["Místo narození", brigadnik.misto_narozeni],
                  ["Adresa", brigadnik.adresa],
                  ["Korespondenční adresa", brigadnik.korespondencni_adresa],
                  ["Rodné číslo", brigadnik.rodne_cislo ? "••••/••••" : null],
                  ["Číslo OP", brigadnik.cislo_op ? "••••••••" : null],
                  ["Zdravotní pojišťovna", brigadnik.zdravotni_pojistovna],
                  ["Číslo účtu", brigadnik.cislo_uctu ? `${brigadnik.cislo_uctu}/${brigadnik.kod_banky}` : null],
                  ["Vzdělání", brigadnik.vzdelani],
                  ["Student", brigadnik.student != null ? (brigadnik.student ? "Ano" : "Ne") : null],
                  ["Škola", brigadnik.nazev_skoly],
                  ["Sleva jinde", brigadnik.uplatnuje_slevu_jinde != null ? (brigadnik.uplatnuje_slevu_jinde ? "Ano" : "Ne") : null],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{(value as string) || "—"}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="smluvni" className="mt-4 space-y-4">
          {brigadnik.dotaznik_vyplnen && (
            <Card>
              <CardHeader><CardTitle>Akce pro aktuální měsíc</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <GenerateDppButton brigadnikId={brigadnik.id} mesic={new Date().toISOString().slice(0, 7)} />
                  <SendDppButton brigadnikId={brigadnik.id} mesic={new Date().toISOString().slice(0, 7)} />
                </div>
                <UploadPodpisForm brigadnikId={brigadnik.id} mesic={new Date().toISOString().slice(0, 7)} typ="dpp_podpis" label="Podepsaná DPP" />
                <UploadPodpisForm brigadnikId={brigadnik.id} mesic={new Date().toISOString().slice(0, 7)} typ="prohlaseni_podpis" label="Podepsané prohlášení" />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Smluvní stav per měsíc</CardTitle></CardHeader>
            <CardContent>
              {smluvniStav.length === 0 ? (
                <p className="text-sm text-muted-foreground">Žádné záznamy. Vygenerujte DPP výše.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Měsíc</TableHead>
                      <TableHead>DPP</TableHead>
                      <TableHead>Prohlášení</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {smluvniStav.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          {new Date(s.mesic).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}
                        </TableCell>
                        <TableCell>
                          <span className={DPP_STATES[s.dpp_stav as keyof typeof DPP_STATES]?.color ?? ""}>
                            {DPP_STATES[s.dpp_stav as keyof typeof DPP_STATES]?.label ?? s.dpp_stav}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={DPP_STATES[s.prohlaseni_stav as keyof typeof DPP_STATES]?.color ?? ""}>
                            {DPP_STATES[s.prohlaseni_stav as keyof typeof DPP_STATES]?.label ?? s.prohlaseni_stav}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historie" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Historie</CardTitle></CardHeader>
            <CardContent>
              {historie.length === 0 ? (
                <p className="text-sm text-muted-foreground">Žádná historie.</p>
              ) : (
                <div className="space-y-3">
                  {historie.map((h) => (
                    <div key={h.id} className="flex items-start gap-3 text-sm">
                      <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                        {new Date(h.created_at).toLocaleString("cs-CZ")}
                      </span>
                      <span>{h.popis}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
