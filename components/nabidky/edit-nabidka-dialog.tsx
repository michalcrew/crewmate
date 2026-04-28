"use client"

import { useActionState, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Pencil, UserCog, HardHat } from "lucide-react"
import { updateNabidka } from "@/lib/actions/nabidky"
import { TYP_POZICE_OPTIONS, NABIDKA_TYPY, type NabidkaTyp } from "@/lib/constants"
import { toast } from "sonner"

type AkceData = {
  id: string
  datum: string | null
  misto: string | null
  cas_od: string | null
  cas_do: string | null
  pocet_brigadniku?: number | null
  pocet_koordinatoru?: number | null
}

type Props = {
  nabidka: {
    id: string
    nazev: string
    typ: string
    klient: string | null
    typ_pozice: string | null
    popis_prace: string | null
    pozadavky: string | null
    odmena: string | null
    misto: string | null
    datum_od: string | null
    datum_do: string | null
    pocet_brigadniku?: number | null
    pocet_koordinatoru?: number | null
    sazba_brigadnik?: number | null
    sazba_koordinator?: number | null
    publikovano: boolean
    koho_hledame?: string | null
    co_nabizime?: string | null
  }
  /** Pro typ='jednodenni' — existující akce (nebo null pokud nebyla nikdy vytvořena). */
  akce?: AkceData | null
}

export function EditNabidkaDialog({ nabidka, akce }: Props) {
  const [open, setOpen] = useState(false)
  const typLabel = NABIDKA_TYPY[nabidka.typ as NabidkaTyp]?.label ?? nabidka.typ
  const isUkoncena = nabidka.typ === "ukoncena"
  const isJednodenni = nabidka.typ === "jednodenni"

  // UI-only checkbox — toggluje viditelnost koord polí. Hodnoty se neresetují
  // v DB při form submit (server pošle null pro sazbu, 0 pro počet).
  const initialMaKoord =
    (nabidka.sazba_koordinator ?? null) !== null ||
    (nabidka.pocet_koordinatoru ?? 0) > 0
  const [maKoordinatora, setMaKoordinatora] = useState(initialMaKoord)

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await updateNabidka(nabidka.id, formData)
      if ("error" in result && result.error) {
        return { error: result.error }
      }
      if ((result as { warning?: string }).warning) {
        toast.warning((result as { warning: string }).warning)
      } else {
        toast.success(isJednodenni ? "Zakázka i akce uloženy" : "Zakázka upravena")
      }
      setOpen(false)
      return null
    },
    null
  )

  if (isUkoncena) {
    return (
      <Button variant="outline" size="sm" disabled title="Ukončenou zakázku nelze upravovat">
        <Pencil className="h-4 w-4 mr-1" />
        Upravit
      </Button>
    )
  }

  // Time formátování: DB má HH:MM:SS, input[type=time] chce HH:MM
  const casOdInit = akce?.cas_od?.slice(0, 5) ?? ""
  const casDoInit = akce?.cas_do?.slice(0, 5) ?? ""

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 mr-1" />
          Upravit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upravit zakázku</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="en-nazev">Název</Label>
            <Input id="en-nazev" name="nazev" defaultValue={nabidka.nazev} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Typ zakázky</Label>
              <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                {typLabel} <span className="ml-2 text-xs">(nelze změnit)</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Typ pozice</Label>
              <select name="typ_pozice" defaultValue={nabidka.typ_pozice ?? ""} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">—</option>
                {TYP_POZICE_OPTIONS.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Klient</Label>
              <Input name="klient" defaultValue={nabidka.klient ?? ""} />
            </div>
            <div className="space-y-2">
              <Label>Místo</Label>
              <Input name="misto" defaultValue={nabidka.misto ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Odměna (volný text)</Label>
            <Input name="odmena" defaultValue={nabidka.odmena ?? ""} placeholder="např. 180 Kč/h, hotově po akci" />
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
                  id="en-ma-koord"
                  name="ma_koordinatora"
                  className="h-4 w-4"
                  checked={maKoordinatora}
                  onChange={(e) => setMaKoordinatora(e.target.checked)}
                />
                <Label htmlFor="en-ma-koord" className="font-normal flex items-center gap-1">
                  <UserCog className="h-3.5 w-3.5" /> Mít koordinátora
                </Label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="en-pocet-brig" className="flex items-center gap-1">
                    <HardHat className="h-3.5 w-3.5" /> Počet brigádníků
                  </Label>
                  <Input
                    id="en-pocet-brig"
                    name="pocet_brigadniku"
                    type="number"
                    min="0"
                    defaultValue={nabidka.pocet_brigadniku ?? 0}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="en-sazba-brig">Sazba brigádníka (Kč/h)</Label>
                  <Input
                    id="en-sazba-brig"
                    name="sazba_brigadnik"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={nabidka.sazba_brigadnik ?? ""}
                    placeholder="např. 180"
                  />
                </div>
              </div>

              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${maKoordinatora ? "" : "opacity-40 pointer-events-none"}`}>
                <div className="space-y-2">
                  <Label htmlFor="en-pocet-koord" className="flex items-center gap-1">
                    <UserCog className="h-3.5 w-3.5" /> Počet koordinátorů
                  </Label>
                  <Input
                    id="en-pocet-koord"
                    name="pocet_koordinatoru"
                    type="number"
                    min="0"
                    defaultValue={nabidka.pocet_koordinatoru ?? 0}
                    disabled={!maKoordinatora}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="en-sazba-koord">Sazba koordinátora (Kč/h)</Label>
                  <Input
                    id="en-sazba-koord"
                    name="sazba_koordinator"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={nabidka.sazba_koordinator ?? ""}
                    placeholder="např. 250"
                    disabled={!maKoordinatora}
                  />
                </div>
              </div>
              {!maKoordinatora && (
                <p className="text-xs text-muted-foreground">
                  Bez koordinátora — sazba se uloží jako prázdná, do DB jde NULL.
                </p>
              )}
            </CardContent>
          </Card>
          {!isJednodenni && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Datum od</Label>
                <Input name="datum_od" type="date" defaultValue={nabidka.datum_od ?? ""} />
              </div>
              <div className="space-y-2">
                <Label>Datum do</Label>
                <Input name="datum_do" type="date" defaultValue={nabidka.datum_do ?? ""} />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Popis práce</Label>
            <Textarea name="popis_prace" defaultValue={nabidka.popis_prace ?? ""} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Koho hledáme</Label>
            <Textarea name="koho_hledame" defaultValue={nabidka.koho_hledame ?? ""} rows={2} placeholder="Popis hledaných pozic, ideální kandidát..." />
          </div>
          <div className="space-y-2">
            <Label>Požadavky</Label>
            <Textarea name="pozadavky" defaultValue={nabidka.pozadavky ?? ""} rows={2} placeholder="Zkušenosti, věk, jazyk..." />
          </div>
          <div className="space-y-2">
            <Label>Co nabízíme</Label>
            <Textarea name="co_nabizime" defaultValue={nabidka.co_nabizime ?? ""} rows={2} placeholder="Odměna, benefity, zázemí..." />
          </div>

          {/* Akce fields — jen pro jednodenni (1:1 vazba) */}
          {isJednodenni && (
            <Card className="bg-blue-500/5 border-blue-500/20">
              <CardHeader>
                <CardTitle className="text-base">
                  {akce ? "Akce" : "Akce (zatím nevytvořena)"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <p className="text-xs text-muted-foreground">
                  {akce
                    ? "Úprava data/místa akce se projeví v /app/akce a docházkových listech."
                    : "Vyplněním data se akce automaticky vytvoří (včetně PIN pro docházku)."}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="en-akce-datum">Datum akce *</Label>
                    <Input
                      id="en-akce-datum"
                      name="akce_datum"
                      type="date"
                      defaultValue={akce?.datum ?? ""}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="en-akce-misto">Místo akce</Label>
                    <Input
                      id="en-akce-misto"
                      name="akce_misto"
                      defaultValue={akce?.misto ?? nabidka.misto ?? ""}
                      placeholder="např. SaSaZu, Praha 7"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="en-akce-cas-od">Čas od</Label>
                    <Input id="en-akce-cas-od" name="akce_cas_od" type="time" defaultValue={casOdInit} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="en-akce-cas-do">Čas do</Label>
                    <Input id="en-akce-cas-do" name="akce_cas_do" type="time" defaultValue={casDoInit} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="en-akce-pocet-brig" className="flex items-center gap-1">
                      <HardHat className="h-3.5 w-3.5" /> Počet brigádníků na akci
                    </Label>
                    <Input
                      id="en-akce-pocet-brig"
                      name="akce_pocet_brigadniku"
                      type="number"
                      min="0"
                      defaultValue={akce?.pocet_brigadniku ?? nabidka.pocet_brigadniku ?? 0}
                    />
                  </div>
                  <div className={`space-y-2 ${maKoordinatora ? "" : "opacity-40 pointer-events-none"}`}>
                    <Label htmlFor="en-akce-pocet-koord" className="flex items-center gap-1">
                      <UserCog className="h-3.5 w-3.5" /> Počet koordinátorů na akci
                    </Label>
                    <Input
                      id="en-akce-pocet-koord"
                      name="akce_pocet_koordinatoru"
                      type="number"
                      min="0"
                      defaultValue={akce?.pocet_koordinatoru ?? nabidka.pocet_koordinatoru ?? 0}
                      disabled={!maKoordinatora}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" id="en-publikovano" name="publikovano" defaultChecked={nabidka.publikovano} className="h-4 w-4" />
            <Label htmlFor="en-publikovano" className="font-normal">Publikovat na /prace</Label>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button type="submit" disabled={pending}>{pending ? "Ukládám..." : "Uložit"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
