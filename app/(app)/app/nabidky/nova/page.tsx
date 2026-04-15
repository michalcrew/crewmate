"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createNabidka } from "@/lib/actions/nabidky"
import { TYP_POZICE_OPTIONS } from "@/lib/constants"

export default function NovaNabidkaPage() {
  const router = useRouter()

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await createNabidka(formData)
      if (result.success) {
        router.push("/app/nabidky")
        return null
      }
      return result
    },
    null
  )

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Nová nabídka</h1>

      <Card>
        <CardHeader>
          <CardTitle>Základní údaje</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nazev">Název nabídky *</Label>
              <Input id="nazev" name="nazev" placeholder="např. Obsluha šatny — Sasazu" required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="typ">Typ</Label>
                <select name="typ" id="typ" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="jednorazova">Jednorázová</option>
                  <option value="prubezna">Průběžná</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="typ_pozice">Typ pozice</Label>
                <select name="typ_pozice" id="typ_pozice" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">— vyberte —</option>
                  {TYP_POZICE_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="klient">Klient</Label>
                <Input id="klient" name="klient" placeholder="např. SaSaZu Club" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="misto">Místo</Label>
                <Input id="misto" name="misto" placeholder="např. Praha 7" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="odmena">Odměna</Label>
                <Input id="odmena" name="odmena" placeholder="např. 180 Kč/hod" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pocet_lidi">Počet lidí per směna</Label>
                <Input id="pocet_lidi" name="pocet_lidi" type="number" min="1" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="datum_od">Datum od</Label>
                <Input id="datum_od" name="datum_od" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="datum_do">Datum do</Label>
                <Input id="datum_do" name="datum_do" type="date" />
              </div>
            </div>

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

            <div className="flex items-center gap-2">
              <input type="checkbox" id="zverejnena" name="zverejnena" className="h-4 w-4 rounded border-input" />
              <Label htmlFor="zverejnena" className="font-normal">Zveřejnit na kariérní stránce (/prace)</Label>
            </div>

            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Ukládám..." : "Vytvořit nabídku"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Zrušit
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
