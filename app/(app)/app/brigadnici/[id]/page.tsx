import type { Metadata } from "next"
import { notFound } from "next/navigation"

// HF4d: Server Actions z této stránky (send DPP/prohlášení) renderují PDF
// s fontem — dá se přes 10s default timeout na Vercel Hobby. Pro Fluid Compute
// (nový free tier od 2025) max 300s, Pro plan 800s.
export const maxDuration = 60
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
  getBrigadnikZkusenosti,
} from "@/lib/actions/brigadnici"
import { PIPELINE_STATES, DPP_STATES } from "@/lib/constants"
import { SendDotaznikButton } from "@/components/brigadnici/send-dotaznik-button"
import { GenerateDppButton, GenerateProhlaseniButton, SendDppButton, UploadPodpisForm } from "@/components/brigadnici/dpp-actions"
import { EditBrigadnikDialog } from "@/components/brigadnici/edit-brigadnik-dialog"
import { BrigadnikEmailTab } from "@/components/email/brigadnik-email-tab"
import { getThreads, getKomunikaceTimeline } from "@/lib/actions/email"
import { validateDPPFields, validateProhlaseniFields } from "@/lib/documents/dpp-data-validator"

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

  const [pipeline, smluvniStav, historie, zkusenosti, emailData, komunikaceTimeline] = await Promise.all([
    getBrigadnikPipeline(id),
    getBrigadnikSmluvniStav(id),
    getBrigadnikHistorie(id),
    getBrigadnikZkusenosti(id),
    getThreads({ status_filter: undefined, page: 1, limit: 50 }),
    getKomunikaceTimeline(id, { limit: 100 }),
  ])

  // Filter threads for this brigadník
  const brigadnikThreads = emailData.threads.filter(t => t.brigadnik_id === id)
  const dppValidation = validateDPPFields(brigadnik)
  const prohlaseniValidation = validateProhlaseniFields(brigadnik)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/brigadnici">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" /><span className="sr-only">Zpět</span>
          </Button>
        </Link>
        {brigadnik.foto_url && (
          <div className="h-12 w-12 rounded-full overflow-hidden bg-muted shrink-0">
            <img src={brigadnik.foto_url} alt={`${brigadnik.jmeno} ${brigadnik.prijmeni}`} className="h-full w-full object-cover" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold">
              {brigadnik.jmeno} {brigadnik.prijmeni}
            </h1>
            {brigadnik.typ_brigadnika === "osvc" && (
              <Badge
                variant="outline"
                className="bg-purple-500/10 text-purple-600 border-purple-500/20 text-xs"
                aria-label="OSVČ fakturant"
              >
                Fakturant (OSVČ)
              </Badge>
            )}
          </div>
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
            <SendDotaznikButton brigadnikId={brigadnik.id} brigadnikEmail={brigadnik.email} />
          )}
        </div>
      </div>

      <Tabs defaultValue="prehled">
        <TabsList>
          <TabsTrigger value="prehled">Přehled</TabsTrigger>
          <TabsTrigger value="udaje">Osobní údaje</TabsTrigger>
          <TabsTrigger value="zkusenosti">Zkušenosti ({zkusenosti.length})</TabsTrigger>
          <TabsTrigger value="smluvni">Smluvní stav</TabsTrigger>
          <TabsTrigger value="historie">Historie</TabsTrigger>
          <TabsTrigger value="komunikace">Komunikace ({brigadnikThreads.length})</TabsTrigger>
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
                  ["Typ", brigadnik.typ_brigadnika === "osvc" ? "OSVČ (fakturace)" : "Brigádník (DPP)"],
                  ...(brigadnik.typ_brigadnika === "osvc"
                    ? [
                        ["IČO", brigadnik.osvc_ico],
                        ["DIČ", brigadnik.osvc_dic ? "••••••••" : null],
                        ["Fakturační adresa", brigadnik.osvc_fakturacni_adresa],
                      ]
                    : [
                        ["Datum narození", brigadnik.datum_narozeni],
                        ["Místo narození", brigadnik.misto_narozeni],
                        ["Rodné číslo", brigadnik.rodne_cislo ? "••••/••••" : null],
                        ["Rodné jméno", brigadnik.rodne_jmeno],
                        ["Rodné příjmení", brigadnik.rodne_prijmeni],
                        ["Číslo OP", brigadnik.cislo_op ? "••••••••" : null],
                        ["Ulice a č.p.", brigadnik.ulice_cp],
                        ["PSČ", brigadnik.psc],
                        ["Město", brigadnik.mesto_bydliste],
                        ["Země", brigadnik.zeme],
                        ["Národnost", brigadnik.narodnost],
                        ["Adresa (celá)", brigadnik.adresa],
                        ["Korespondenční adresa", brigadnik.korespondencni_adresa],
                        ["Zdravotní pojišťovna", brigadnik.zdravotni_pojistovna],
                        ["Číslo účtu", brigadnik.cislo_uctu ? `${brigadnik.cislo_uctu}/${brigadnik.kod_banky}` : null],
                        ["Vzdělání", brigadnik.vzdelani],
                        ["Růžové prohlášení (chce)", brigadnik.chce_ruzove_prohlaseni != null ? (brigadnik.chce_ruzove_prohlaseni ? "Ano" : "Ne") : null],
                      ]),
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

        <TabsContent value="zkusenosti" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Pracovní zkušenosti</CardTitle></CardHeader>
            <CardContent>
              {zkusenosti.length === 0 ? (
                <p className="text-sm text-muted-foreground">Žádné zkušenosti. Po nahrání CV se automaticky vytěží. Interní akce se zapisují automaticky.</p>
              ) : (
                <div className="space-y-3">
                  {zkusenosti.map((z) => (
                    <div key={z.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{z.pozice}</p>
                          {z.popis && <p className="text-sm text-muted-foreground mt-1">{z.popis}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs ${
                            z.typ === "interni" ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                          }`}>
                            {z.typ === "interni" ? "Crewmate" : "Ext. zkušenost"}
                          </Badge>
                          {z.zdroj === "cv_ai" && (
                            <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/20">AI z CV</Badge>
                          )}
                        </div>
                      </div>
                      {(z.datum_od || z.datum_do) && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {z.datum_od && new Date(z.datum_od).toLocaleDateString("cs-CZ")}
                          {z.datum_do && ` — ${new Date(z.datum_do).toLocaleDateString("cs-CZ")}`}
                        </p>
                      )}
                      {z.akce && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Akce: {(z.akce as unknown as { nazev: string })?.nazev}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="smluvni" className="mt-4 space-y-4">
          {brigadnik.dotaznik_vyplnen && brigadnik.typ_brigadnika !== "osvc" && (
            <Card>
              <CardHeader><CardTitle>Akce pro aktuální rok</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <GenerateDppButton brigadnikId={brigadnik.id} rok={new Date().getFullYear()} />
                  <GenerateProhlaseniButton brigadnikId={brigadnik.id} rok={new Date().getFullYear()} />
                  <SendDppButton brigadnikId={brigadnik.id} rok={new Date().getFullYear()} />
                </div>
                <UploadPodpisForm brigadnikId={brigadnik.id} rok={new Date().getFullYear()} typ="dpp_podpis" label="Podepsaná DPP" />
                <UploadPodpisForm brigadnikId={brigadnik.id} rok={new Date().getFullYear()} typ="prohlaseni_podpis" label="Podepsané prohlášení" />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Smluvní stav per rok</CardTitle></CardHeader>
            <CardContent>
              {smluvniStav.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {brigadnik.typ_brigadnika === "osvc"
                    ? "OSVČ nemá DPP ani prohlášení."
                    : "Žádné záznamy. Vygenerujte DPP výše."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rok</TableHead>
                      <TableHead>DPP</TableHead>
                      <TableHead>Prohlášení</TableHead>
                      <TableHead>Platnost do</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {smluvniStav.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="tabular-nums font-medium">{s.rok}</TableCell>
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
                        <TableCell className="text-muted-foreground text-xs">
                          {s.platnost_do
                            ? new Date(s.platnost_do).toLocaleDateString("cs-CZ")
                            : "—"}
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

        <TabsContent value="komunikace" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Emailová komunikace</CardTitle></CardHeader>
            <CardContent>
              <BrigadnikEmailTab
                brigadnikId={brigadnik.id}
                brigadnikEmail={brigadnik.email}
                brigadnikName={`${brigadnik.jmeno} ${brigadnik.prijmeni}`}
                missingDppFields={dppValidation.missing}
                missingProhlaseniFields={prohlaseniValidation.missing}
                threads={brigadnikThreads}
                timeline={komunikaceTimeline}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
