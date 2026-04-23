import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, MapPin, Calendar, Clock, Users, Key } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getAkceById, getAkcePrirazeni } from "@/lib/actions/akce"
import { getBrigadnici } from "@/lib/actions/brigadnici"
import { createClient } from "@/lib/supabase/server"
import { AddPrirazeniDialog } from "@/components/akce/add-prirazeni-dialog"
import { AkceStavSelector } from "@/components/akce/akce-stav-selector"
import { AkceDetailZrusitButton } from "@/components/akce/akce-detail-zrusit-button"
import { EditAkceDialog } from "@/components/akce/edit-akce-dialog"
import { DokumentacniStavSelect } from "@/components/brigadnici/dokumentacni-stav-select"

export const metadata: Metadata = { title: "Detail akce" }

export default async function AkceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const akce = await getAkceById(id)
  if (!akce) notFound()

  const [prirazeni, allBrigadnici] = await Promise.all([
    getAkcePrirazeni(id),
    getBrigadnici(),
  ])
  const prirazeniCount = prirazeni.filter((p) => p.status === "prirazeny").length
  const nahradniciCount = prirazeni.filter((p) => p.status === "nahradnik").length
  const prirazeniIds = new Set(prirazeni.map(p => (p.brigadnik as unknown as { id: string })?.id))
  const availableBrigadnici = (allBrigadnici ?? [])
    .filter(b => !prirazeniIds.has(b.id))
    .map(b => ({ id: b.id, jmeno: b.jmeno, prijmeni: b.prijmeni, telefon: b.telefon }))

  // F-0016 post: dokumentační stav per brigádníka z VIEW (JOIN přes nabidka_id pokud akce má zakázku)
  const brigadnikIds = [...prirazeniIds].filter(Boolean) as string[]
  const dokStavMap = new Map<string, string>()
  // Vlastník (naborar) per brigadnik v kontextu této zakázky (akce.nabidka_id).
  const vlastnikMap = new Map<string, { jmeno: string; prijmeni: string }>()
  if (brigadnikIds.length > 0) {
    const supabase = await createClient()
    const nabidkaId = (akce as unknown as { nabidka_id?: string | null }).nabidka_id ?? null
    if (nabidkaId) {
      const { data } = await supabase
        .from("v_brigadnik_zakazka_status")
        .select("brigadnik_id, dokumentacni_stav")
        .eq("nabidka_id", nabidkaId)
        .in("brigadnik_id", brigadnikIds)
      for (const r of data ?? []) {
        if (r.brigadnik_id && r.dokumentacni_stav) dokStavMap.set(r.brigadnik_id, r.dokumentacni_stav)
      }

      // Vlastník (naborar) — pipeline_entry pro brigadnici v této nabidce.
      const { data: pipelineRows } = await supabase
        .from("pipeline_entries")
        .select("brigadnik_id, naborar_id")
        .eq("nabidka_id", nabidkaId)
        .in("brigadnik_id", brigadnikIds)
      const naborarIds = [...new Set((pipelineRows ?? []).map(p => (p as { naborar_id: string | null }).naborar_id).filter(Boolean))] as string[]
      if (naborarIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, jmeno, prijmeni")
          .in("id", naborarIds)
        const userMap = new Map<string, { jmeno: string; prijmeni: string }>()
        for (const u of users ?? []) userMap.set((u as { id: string }).id, { jmeno: (u as { jmeno: string }).jmeno, prijmeni: (u as { prijmeni: string }).prijmeni })
        for (const row of pipelineRows ?? []) {
          const r = row as { brigadnik_id: string; naborar_id: string | null }
          if (r.naborar_id && userMap.has(r.naborar_id)) vlastnikMap.set(r.brigadnik_id, userMap.get(r.naborar_id)!)
        }
      }
    }
    // Fallback: pro brigádníky bez nabidka_id řádku (ad-hoc akce) se stav počítá z brigadnici + smluvni_stav
    const missing = brigadnikIds.filter(id => !dokStavMap.has(id))
    if (missing.length > 0) {
      const rok = new Date().getFullYear()
      const [{ data: bros }, { data: smluvy }] = await Promise.all([
        supabase.from("brigadnici").select("id, typ_brigadnika, dotaznik_vyplnen").in("id", missing),
        supabase.from("smluvni_stav").select("brigadnik_id, dpp_stav").eq("rok", rok).in("brigadnik_id", missing),
      ])
      const smlmap = new Map((smluvy ?? []).map(s => [s.brigadnik_id, s.dpp_stav]))
      for (const b of bros ?? []) {
        if (b.typ_brigadnika === "osvc") { dokStavMap.set(b.id, "osvc"); continue }
        const dpp = smlmap.get(b.id)
        if (dpp === "ukoncena")       dokStavMap.set(b.id, "ukoncena_dpp")
        else if (dpp === "podepsano") dokStavMap.set(b.id, "podepsana_dpp")
        else if (dpp === "odeslano")  dokStavMap.set(b.id, "poslana_dpp")
        else if (b.dotaznik_vyplnen)  dokStavMap.set(b.id, "vyplnene_udaje")
        else                          dokStavMap.set(b.id, "nevyplnene_udaje")
      }
    }
  }

  const akceStav = (akce.stav ?? "planovana") as "planovana" | "probehla" | "zrusena"
  const isZrusena = akceStav === "zrusena"
  const isProbehla = akceStav === "probehla"

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/akce">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /><span className="sr-only">Zpět</span></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold">{akce.nazev}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(akce.datum).toLocaleDateString("cs-CZ")}</span>
            {akce.cas_od && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{akce.cas_od.slice(0, 5)}{akce.cas_do ? ` — ${akce.cas_do.slice(0, 5)}` : ""}</span>}
            {akce.misto && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{akce.misto}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick-edit čas + počet lidí (schováno pro zrušené) */}
          {!isZrusena && (
            <EditAkceDialog
              akceId={id}
              akceStav={akceStav}
              defaultCasOd={akce.cas_od ?? null}
              defaultCasDo={akce.cas_do ?? null}
              defaultPocetLidi={akce.pocet_lidi ?? null}
              nazev={akce.nazev}
              datum={akce.datum}
              misto={akce.misto ?? null}
            />
          )}
          {/* F-0018: odkaz na admin dochazka grid */}
          <Link href={`/app/akce/${id}/dochazka`}>
            <Button variant="outline" size="sm">Docházka</Button>
          </Link>
          {/* Inline stav selector (F-0015 US-1E-1) */}
          <AkceStavSelector
            akceId={id}
            akceName={akce.nazev}
            akceDate={akce.datum}
            currentStav={akceStav}
          />
          {/* Zrušit akci button — skrytý pro zrušené + proběhlé */}
          {!isZrusena && !isProbehla && (
            <AkceDetailZrusitButton
              akceId={id}
              akceName={akce.nazev}
              akceDate={akce.datum}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Přiřazeno</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {prirazeniCount}{akce.pocet_lidi ? `/${akce.pocet_lidi}` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Náhradníci</span>
            </div>
            <p className="text-2xl font-bold mt-1">{nahradniciCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">PIN pro koordinátora</span>
            </div>
            <p className="text-2xl font-bold mt-1 font-mono">{akce.pin_kod}</p>
          </CardContent>
        </Card>
      </div>

      {isZrusena && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Akce je <strong>zrušená</strong>. Úpravy ani přidávání brigádníků nejsou možné.
        </div>
      )}
      {isProbehla && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Akce je <strong>proběhlá</strong>. Editace je omezena na poznámky a počet lidí.
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Přiřazení brigádníci</CardTitle>
          {!isZrusena && <AddPrirazeniDialog akceId={id} brigadnici={availableBrigadnici} />}
        </CardHeader>
        <CardContent>
          {prirazeni.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatím nikdo přiřazený.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brigádník</TableHead>
                  <TableHead>Vlastník</TableHead>
                  <TableHead>Pozice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead>Příchod</TableHead>
                  <TableHead>Odchod</TableHead>
                  <TableHead>Hodin</TableHead>
                  <TableHead>Hodnocení</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prirazeni.map((p) => {
                  const b = p.brigadnik as { id: string; jmeno: string; prijmeni: string; telefon: string } | null
                  const d = (p.dochazka as { prichod: string | null; odchod: string | null; hodin_celkem: number | null; hodnoceni: number | null }[])?.[0]
                  const dokStav = b ? dokStavMap.get(b.id) : undefined
                  const vlastnik = b ? vlastnikMap.get(b.id) : undefined
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        {b ? (
                          <Link href={`/app/brigadnici/${b.id}`} className="font-medium hover:underline">
                            {b.prijmeni} {b.jmeno}
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {vlastnik ? (
                          <Badge
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/20 text-xs"
                            title={`${vlastnik.jmeno} ${vlastnik.prijmeni}`}
                          >
                            👤 {vlastnik.jmeno}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.pozice || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          p.status === "prirazeny" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                          p.status === "nahradnik" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                          "bg-red-500/10 text-red-500 border-red-500/20"
                        }>
                          {p.status === "prirazeny" ? "Přiřazený" : p.status === "nahradnik" ? `Náhradník #${p.poradi_nahradnik ?? ""}` : "Vypadl"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {b ? (
                          <DokumentacniStavSelect
                            brigadnikId={b.id}
                            current={dokStav}
                            ariaLabel={`${b.prijmeni} ${b.jmeno}`}
                            compact
                            disabled={isZrusena}
                          />
                        ) : "—"}
                      </TableCell>
                      <TableCell>{d?.prichod?.slice(0, 5) ?? "—"}</TableCell>
                      <TableCell>{d?.odchod?.slice(0, 5) ?? "—"}</TableCell>
                      <TableCell>{d?.hodin_celkem != null ? `${d.hodin_celkem}h` : "—"}</TableCell>
                      <TableCell>{d?.hodnoceni ? `${d.hodnoceni}/5` : "—"}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
