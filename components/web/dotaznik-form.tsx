"use client"

import { useActionState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { CheckCircle } from "lucide-react"
import { submitDotaznik } from "@/lib/actions/formular"
import { ZDRAVOTNI_POJISTOVNY, VZDELANI_OPTIONS } from "@/lib/constants"

type Props = {
  token: string
  defaultValues: { jmeno: string; prijmeni: string; email: string; telefon: string }
}

export function DotaznikForm({ token, defaultValues }: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      return await submitDotaznik(formData)
    },
    null
  )

  if (state?.success) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Údaje uloženy!</h2>
          <p className="text-muted-foreground">Děkujeme za vyplnění. Nyní můžeme připravit DPP.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="jmeno">Jméno *</Label>
              <Input id="jmeno" name="jmeno" defaultValue={defaultValues.jmeno} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prijmeni">Příjmení *</Label>
              <Input id="prijmeni" name="prijmeni" defaultValue={defaultValues.prijmeni} required />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rodne_cislo">Rodné číslo *</Label>
              <Input id="rodne_cislo" name="rodne_cislo" placeholder="000000/0000" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="datum_narozeni">Datum narození *</Label>
              <Input id="datum_narozeni" name="datum_narozeni" type="date" required />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rodne_jmeno">Rodné jméno</Label>
              <Input id="rodne_jmeno" name="rodne_jmeno" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rodne_prijmeni">Rodné příjmení</Label>
              <Input id="rodne_prijmeni" name="rodne_prijmeni" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="misto_narozeni">Místo narození *</Label>
            <Input id="misto_narozeni" name="misto_narozeni" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adresa">Trvalé bydliště *</Label>
            <Input id="adresa" name="adresa" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="korespondencni_adresa">Korespondenční adresa (pokud se liší)</Label>
            <Input id="korespondencni_adresa" name="korespondencni_adresa" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cislo_op">Číslo OP *</Label>
              <Input id="cislo_op" name="cislo_op" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zdravotni_pojistovna">Zdravotní pojišťovna *</Label>
              <select id="zdravotni_pojistovna" name="zdravotni_pojistovna" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">— vyberte —</option>
                {ZDRAVOTNI_POJISTOVNY.map((zp) => (
                  <option key={zp.kod} value={zp.kod}>{zp.kod} — {zp.nazev}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cislo_uctu">Číslo účtu *</Label>
              <Input id="cislo_uctu" name="cislo_uctu" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kod_banky">Kód banky *</Label>
              <Input id="kod_banky" name="kod_banky" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vzdelani">Nejvyšší ukončené vzdělání *</Label>
            <select id="vzdelani" name="vzdelani" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">— vyberte —</option>
              {VZDELANI_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="student" name="student" className="h-4 w-4" />
            <Label htmlFor="student" className="font-normal">Jsem student</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nazev_skoly">Název školy (pokud student)</Label>
            <Input id="nazev_skoly" name="nazev_skoly" />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="uplatnuje_slevu_jinde" name="uplatnuje_slevu_jinde" className="h-4 w-4" />
            <Label htmlFor="uplatnuje_slevu_jinde" className="font-normal">Uplatňuji slevu na dani u jiného zaměstnavatele</Label>
          </div>

          <div className="flex items-start gap-2 pt-2">
            <input type="checkbox" id="gdpr" name="gdpr" required className="h-4 w-4 mt-0.5" />
            <Label htmlFor="gdpr" className="font-normal text-sm text-muted-foreground">
              Souhlasím se zpracováním osobních údajů za účelem uzavření DPP a mzdové agendy. *
            </Label>
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Ukládám..." : "Odeslat údaje"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
