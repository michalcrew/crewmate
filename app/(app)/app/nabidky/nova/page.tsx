"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { createNabidka } from "@/lib/actions/nabidky"
import { TYP_POZICE_OPTIONS } from "@/lib/constants"
import { Calendar, Repeat, ArrowLeft, UserCog, HardHat } from "lucide-react"

type Typ = "jednodenni" | "opakovana"

export default function NovaNabidkaPage() {
  const router = useRouter()
  const [typ, setTyp] = useState<Typ | null>(null)
  const [maKoordinatora, setMaKoordinatora] = useState(false)

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await createNabidka(formData)
      if (result.success && result.id) {
        router.push(`/app/nabidky/${result.id}`)
        return null
      }
      return result as { error?: string }
    },
    null
  )

  // Step 1: typ selector
  if (!typ) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">Nová zakázka</h1>
        <p className="text-muted-foreground mb-6">Vyberte typ zakázky, kterou chcete vytvořit:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setTyp("jednodenni")}
            className="text-left rounded-xl border-2 border-border hover:border-blue-500 hover:bg-blue-500/5 p-6 transition-all"
          >
            <Calendar className="h-8 w-8 text-blue-500 mb-3" />
            <h2 className="text-lg font-semibold mb-1">Jednodenní</h2>
            <p className="text-sm text-muted-foreground">
              Jeden event, jedna akce. Např. &bdquo;Ples Galerie 15.5.2026&ldquo;.
              Vytvoří se zakázka + akce v jednom kroku.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setTyp("opakovana")}
            className="text-left rounded-xl border-2 border-border hover:border-green-500 hover:bg-green-500/5 p-6 transition-all"
          >
            <Repeat className="h-8 w-8 text-green-500 mb-3" />
            <h2 className="text-lg font-semibold mb-1">Opakovaná</h2>
            <p className="text-sm text-muted-foreground">
              Průběžný nábor s více akcemi. Např. &bdquo;Sasazu &ndash; Duben&ldquo;.
              Akce přidáte postupně v detailu zakázky.
            </p>
          </button>
        </div>
        <div className="mt-6">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Zpět
          </Button>
        </div>
      </div>
    )
  }

  // Step 2: form (shared shell)
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setTyp(null)} type="button">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">
            Nová {typ === "jednodenni" ? "jednodenní" : "opakovaná"} zakázka
          </h1>
          <p className="text-sm text-muted-foreground">
            {typ === "jednodenni"
              ? "Vytvoří se zakázka spolu s jednou akcí."
              : "Akce přidáte později v detailu zakázky."}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Údaje o zakázce</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="typ" value={typ} />

            <div className="space-y-2">
              <Label htmlFor="nazev">Název zakázky *</Label>
              <Input id="nazev" name="nazev" placeholder={typ === "jednodenni" ? "např. Ples Galerie 15.5." : "např. Sasazu — Duben"} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="typ_pozice">Typ pozice</Label>
                <select name="typ_pozice" id="typ_pozice" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">— vyberte —</option>
                  {TYP_POZICE_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="klient">Klient</Label>
                <Input id="klient" name="klient" placeholder="např. SaSaZu Club" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="misto">Město / lokalita</Label>
                <Input id="misto" name="misto" placeholder="např. Praha 7" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="odmena">Odměna</Label>
                <Input id="odmena" name="odmena" placeholder="např. 180 Kč/hod" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="datum_od">Zakázka od</Label>
                <Input id="datum_od" name="datum_od" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="datum_do">Zakázka do</Label>
                <Input id="datum_do" name="datum_do" type="date" />
              </div>
            </div>

            {/* Tým a sazby */}
            <Card className="bg-muted/30">
              <CardHeader>
                <CardTitle className="text-base">Tým a sazby</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="nn-ma-koord"
                    name="ma_koordinatora"
                    className="h-4 w-4"
                    checked={maKoordinatora}
                    onChange={(e) => setMaKoordinatora(e.target.checked)}
                  />
                  <Label htmlFor="nn-ma-koord" className="font-normal flex items-center gap-1">
                    <UserCog className="h-3.5 w-3.5" /> Mít koordinátora
                  </Label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pocet_brigadniku" className="flex items-center gap-1">
                      <HardHat className="h-3.5 w-3.5" /> Počet brigádníků
                    </Label>
                    <Input id="pocet_brigadniku" name="pocet_brigadniku" type="number" min="0" defaultValue={0} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sazba_brigadnik">Sazba brigádníka (Kč/h)</Label>
                    <Input id="sazba_brigadnik" name="sazba_brigadnik" type="number" min="0" step="0.01" placeholder="např. 180" />
                  </div>
                </div>
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${maKoordinatora ? "" : "opacity-40 pointer-events-none"}`}>
                  <div className="space-y-2">
                    <Label htmlFor="pocet_koordinatoru" className="flex items-center gap-1">
                      <UserCog className="h-3.5 w-3.5" /> Počet koordinátorů
                    </Label>
                    <Input id="pocet_koordinatoru" name="pocet_koordinatoru" type="number" min="0" defaultValue={0} disabled={!maKoordinatora} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sazba_koordinator">Sazba koordinátora (Kč/h)</Label>
                    <Input id="sazba_koordinator" name="sazba_koordinator" type="number" min="0" step="0.01" placeholder="např. 250" disabled={!maKoordinatora} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="popis_prace">Popis práce</Label>
              <Textarea id="popis_prace" name="popis_prace" placeholder="Co bude brigádník dělat..." rows={3} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="koho_hledame">Koho hledáme</Label>
              <Textarea id="koho_hledame" name="koho_hledame" placeholder="Popis hledaných pozic, ideální kandidát..." rows={2} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pozadavky">Požadavky</Label>
              <Textarea id="pozadavky" name="pozadavky" placeholder="Zkušenosti, věk, jazyk..." rows={2} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="co_nabizime">Co nabízíme</Label>
              <Textarea id="co_nabizime" name="co_nabizime" placeholder="Odměna, benefity, zázemí..." rows={2} />
            </div>

            {typ === "jednodenni" && (
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardHeader>
                  <CardTitle className="text-base">Údaje o akci</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="akce_datum">Datum akce *</Label>
                      <Input id="akce_datum" name="akce_datum" type="date" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="akce_misto">Místo akce</Label>
                      <Input id="akce_misto" name="akce_misto" placeholder="např. SaSaZu Praha 7" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="akce_cas_od">Čas od</Label>
                      <Input id="akce_cas_od" name="akce_cas_od" type="time" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="akce_cas_do">Čas do</Label>
                      <Input id="akce_cas_do" name="akce_cas_do" type="time" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="akce_pocet_brigadniku" className="flex items-center gap-1">
                        <HardHat className="h-3.5 w-3.5" /> Počet brigádníků na akci
                      </Label>
                      <Input id="akce_pocet_brigadniku" name="akce_pocet_brigadniku" type="number" min="0" placeholder="z týmu výše" />
                    </div>
                    <div className={`space-y-2 ${maKoordinatora ? "" : "opacity-40 pointer-events-none"}`}>
                      <Label htmlFor="akce_pocet_koordinatoru" className="flex items-center gap-1">
                        <UserCog className="h-3.5 w-3.5" /> Počet koordinátorů na akci
                      </Label>
                      <Input id="akce_pocet_koordinatoru" name="akce_pocet_koordinatoru" type="number" min="0" placeholder="z týmu výše" disabled={!maKoordinatora} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pokud necháte prázdné, použijí se hodnoty ze sekce „Tým a sazby" výše.
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center gap-2">
              <input type="checkbox" id="publikovano" name="publikovano" defaultChecked className="h-4 w-4 rounded border-input" />
              <Label htmlFor="publikovano" className="font-normal">Publikovat na kariérní stránce (/prace)</Label>
            </div>

            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Ukládám..." : typ === "jednodenni" ? "Vytvořit zakázku a akci" : "Vytvořit zakázku"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setTyp(null)}>
                Změnit typ
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
