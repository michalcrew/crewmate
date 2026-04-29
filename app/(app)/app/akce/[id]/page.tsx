import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, MapPin, Calendar, Clock, Key, UserCog, HardHat } from "lucide-react"
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
import { PrirazeniRoleSelect } from "@/components/akce/prirazeni-role-select"
import { PovysitNahradnikaDialog } from "@/components/akce/povysit-nahradnika-dialog"
import { PrirazeniRowActions } from "@/components/akce/prirazeni-row-actions"
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
  // PR C — rozdělení do tří sekcí: Tým (prirazeny) / Náhradníci (nahradnik) / Vypadli (vypadl).
  type PrirazeniRow = (typeof prirazeni)[number] & { role?: string | null; sazba_hodinova?: number | null }
  const tym = (prirazeni as PrirazeniRow[]).filter((p) => p.status === "prirazeny")
  const nahradnici = (prirazeni as PrirazeniRow[]).filter((p) => p.status === "nahradnik")
  const vypadli = (prirazeni as PrirazeniRow[]).filter((p) => p.status === "vypadl")

  // Řazení v týmu: koordinátoři první, pak brigádníci, alfabeticky uvnitř.
  const sortByJmeno = (a: PrirazeniRow, b: PrirazeniRow) => {
    const ba = a.brigadnik as { jmeno: string; prijmeni: string } | null
    const bb = b.brigadnik as { jmeno: string; prijmeni: string } | null
    return `${ba?.prijmeni ?? ""} ${ba?.jmeno ?? ""}`.localeCompare(`${bb?.prijmeni ?? ""} ${bb?.jmeno ?? ""}`, "cs")
  }
  const tymSorted = [...tym].sort((a, b) => {
    const aKoord = a.role === "koordinator" ? 0 : 1
    const bKoord = b.role === "koordinator" ? 0 : 1
    if (aKoord !== bKoord) return aKoord - bKoord
    return sortByJmeno(a, b)
  })

  const obsazenoBrig = tym.filter((p) => p.role === "brigadnik").length
  const obsazenoKoord = tym.filter((p) => p.role === "koordinator").length

  const prirazeniIds = new Set(prirazeni.map(p => (p.brigadnik as unknown as { id: string })?.id))
  const availableBrigadnici = (allBrigadnici ?? [])
    .filter(b => !prirazeniIds.has(b.id))
    .map(b => ({ id: b.id, jmeno: b.jmeno, prijmeni: b.prijmeni, telefon: b.telefon }))

  // F-0016 post: dokumentační stav per brigádníka z VIEW (JOIN přes nabidka_id pokud akce má zakázku)
  const brigadnikIds = [...prirazeniIds].filter(Boolean) as string[]
  const dokStavMap = new Map<string, string>()
  // Vlastník (naborar) per brigadnik v kontextu této zakázky (akce.nabidka_id).
  const vlastnikMap = new Map<string, { jmeno: string; prijmeni: string }>()
  // PR C — sazba_koordinator ze zakázky (NULL → koord role disabled v UI).
  let sazbaKoordinator: number | null = null
  {
    const supabase = await createClient()
    const nabidkaId = (akce as unknown as { nabidka_id?: string | null }).nabidka_id ?? null
    if (nabidkaId) {
      const { data: nab } = await supabase
        .from("nabidky")
        .select("sazba_koordinator")
        .eq("id", nabidkaId)
        .single()
      sazbaKoordinator = (nab as { sazba_koordinator?: number | null } | null)?.sazba_koordinator ?? null
    }
  }
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
            <span className="flex items-center gap-1" title="Tým: Koordinátoři / Brigádníci">
              <UserCog className="h-3.5 w-3.5 text-blue-600" />
              {(akce as { pocet_koordinatoru?: number | null }).pocet_koordinatoru ?? 0}
              <span className="opacity-60">/</span>
              <HardHat className="h-3.5 w-3.5 text-amber-600" />
              {(akce as { pocet_brigadniku?: number | null }).pocet_brigadniku ?? 0}
            </span>
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
              defaultPocetBrigadniku={(akce as { pocet_brigadniku?: number | null }).pocet_brigadniku ?? null}
              defaultPocetKoordinatoru={(akce as { pocet_koordinatoru?: number | null }).pocet_koordinatoru ?? null}
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
              <UserCog className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Koordinátoři</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {obsazenoKoord}/{(akce as { pocet_koordinatoru?: number | null }).pocet_koordinatoru ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <HardHat className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-muted-foreground">Brigádníci</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {obsazenoBrig}/{(akce as { pocet_brigadniku?: number | null }).pocet_brigadniku ?? 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {nahradnici.length > 0 ? `+${nahradnici.length} náhradník${nahradnici.length === 1 ? "" : nahradnici.length < 5 ? "ci" : "ů"}` : "žádní náhradníci"}
            </p>
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

      {/* PR C — Sekce TÝM (status='prirazeny') */}
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            <span>Tým</span>
            <span className="text-sm font-normal text-muted-foreground flex items-center gap-2">
              <span className="flex items-center gap-1">
                <UserCog className="h-3.5 w-3.5 text-blue-600" />
                {obsazenoKoord}/{(akce as { pocet_koordinatoru?: number | null }).pocet_koordinatoru ?? 0}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <HardHat className="h-3.5 w-3.5 text-amber-600" />
                {obsazenoBrig}/{(akce as { pocet_brigadniku?: number | null }).pocet_brigadniku ?? 0}
              </span>
            </span>
          </CardTitle>
          {!isZrusena && (
            <AddPrirazeniDialog
              akceId={id}
              brigadnici={availableBrigadnici}
              obsazenoBrig={obsazenoBrig}
              obsazenoKoord={obsazenoKoord}
              pocetBrigadniku={(akce as { pocet_brigadniku?: number | null }).pocet_brigadniku ?? 0}
              pocetKoordinatoru={(akce as { pocet_koordinatoru?: number | null }).pocet_koordinatoru ?? 0}
              sazbaKoordinator={sazbaKoordinator}
            />
          )}
        </CardHeader>
        <CardContent>
          {tymSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatím nikdo přiřazený.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brigádník</TableHead>
                  <TableHead>Vlastník</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sazba</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead>Příchod</TableHead>
                  <TableHead>Odchod</TableHead>
                  <TableHead>Hodin</TableHead>
                  <TableHead>Hodnocení</TableHead>
                  <TableHead className="text-right">Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tymSorted.map((p) => {
                  const b = p.brigadnik as { id: string; jmeno: string; prijmeni: string; telefon: string } | null
                  const d = (p.dochazka as { prichod: string | null; odchod: string | null; hodin_celkem: number | null; hodnoceni: number | null }[])?.[0]
                  const dokStav = b ? dokStavMap.get(b.id) : undefined
                  const vlastnik = b ? vlastnikMap.get(b.id) : undefined
                  const role = (p.role ?? null) as "brigadnik" | "koordinator" | null
                  const sazba = p.sazba_hodinova
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
                      <TableCell>
                        <PrirazeniRoleSelect
                          prirazeniId={p.id}
                          currentRole={role}
                          disabled={isZrusena || isProbehla}
                          koordPovolen={sazbaKoordinator != null}
                        />
                      </TableCell>
                      <TableCell className="text-sm">
                        {sazba != null ? `${sazba} Kč/h` : <span className="text-muted-foreground">—</span>}
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
                      <TableCell className="text-right">
                        <PrirazeniRowActions
                          prirazeniId={p.id}
                          status="prirazeny"
                          brigadnikName={b ? `${b.prijmeni} ${b.jmeno}` : undefined}
                          disabled={isZrusena || isProbehla}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* PR C — Sekce NÁHRADNÍCI (univerzální, role NULL) */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Náhradníci — {nahradnici.length} {nahradnici.length === 1 ? "osoba" : nahradnici.length < 5 ? "osoby" : "osob"}</CardTitle>
        </CardHeader>
        <CardContent>
          {nahradnici.length === 0 ? (
            <p className="text-sm text-muted-foreground">Žádní náhradníci.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brigádník</TableHead>
                  <TableHead>Pořadí</TableHead>
                  <TableHead className="text-right">Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nahradnici
                  .sort((a, b) => (a.poradi_nahradnik ?? 999) - (b.poradi_nahradnik ?? 999))
                  .map((p) => {
                    const b = p.brigadnik as { id: string; jmeno: string; prijmeni: string; telefon: string } | null
                    const jmenoFull = b ? `${b.prijmeni} ${b.jmeno}` : "Brigádník"
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
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                            #{p.poradi_nahradnik ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!isZrusena && !isProbehla && (
                              <PovysitNahradnikaDialog
                                prirazeniId={p.id}
                                brigadnikJmeno={jmenoFull}
                                koordPovolen={sazbaKoordinator != null}
                              />
                            )}
                            <PrirazeniRowActions
                              prirazeniId={p.id}
                              status="nahradnik"
                              brigadnikName={jmenoFull}
                              disabled={isZrusena || isProbehla}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* PR C — Sekce VYPADLI (status='vypadl') */}
      {vypadli.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Vypadli — {vypadli.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brigádník</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vypadli.map((p) => {
                  const b = p.brigadnik as { id: string; jmeno: string; prijmeni: string; telefon: string } | null
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        {b ? (
                          <Link href={`/app/brigadnici/${b.id}`} className="font-medium hover:underline">
                            {b.prijmeni} {b.jmeno}
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {p.role === "koordinator" ? "👔 Koordinátor" : p.role === "brigadnik" ? "👷 Brigádník" : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <PrirazeniRowActions
                          prirazeniId={p.id}
                          status="vypadl"
                          brigadnikName={b ? `${b.prijmeni} ${b.jmeno}` : undefined}
                          disabled={isZrusena || isProbehla}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
