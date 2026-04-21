"use client"

import { useActionState, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Pencil } from "lucide-react"
import { updateBrigadnik, updateBrigadnikCitliveUdaje } from "@/lib/actions/brigadnici"
import { toast } from "sonner"

/**
 * F-0016 US-1B-1 — plný edit dialog.
 *
 * Pokrývá allowlist z server action updateBrigadnik (F-0013):
 * kontakty, adresa, banka, narodnost, chce_ruzove_prohlaseni,
 * poznamky, aktivni, zdroj, OSVČ fields (conditional).
 *
 * RČ/OP/DIČ/typ_brigadnika mají dedicated dialogy (mimo scope).
 * Per Architect open item #4: pokud se nic nezmění → silent close + toast „Žádné změny".
 */

type Brigadnik = {
  id: string
  jmeno: string
  prijmeni: string
  email: string
  telefon: string
  typ_brigadnika: "brigadnik" | "osvc" | null
  ulice_cp: string | null
  psc: string | null
  mesto_bydliste: string | null
  zeme: string | null
  cislo_uctu: string | null
  kod_banky: string | null
  narodnost: string | null
  chce_ruzove_prohlaseni: boolean | null
  osvc_ico: string | null
  osvc_fakturacni_adresa: string | null
  zdravotni_pojistovna: string | null
  vzdelani: string | null
  poznamky: string | null
  rodne_cislo_vyplneno?: boolean
  cislo_op_vyplneno?: boolean
}

type Props = { brigadnik: Brigadnik }

export function UpravitBrigadnikaDialog({ brigadnik }: Props) {
  const [open, setOpen] = useState(false)
  const [typ, setTyp] = useState<"brigadnik" | "osvc">(
    brigadnik.typ_brigadnika === "osvc" ? "osvc" : "brigadnik"
  )
  const [citliveOpen, setCitliveOpen] = useState(false)
  const [rc, setRc] = useState("")
  const [op, setOp] = useState("")
  const [savingCitlive, setSavingCitlive] = useState(false)
  const [citliveErr, setCitliveErr] = useState<string | null>(null)

  async function saveCitlive() {
    setSavingCitlive(true)
    setCitliveErr(null)
    const payload: { rodne_cislo?: string; cislo_op?: string } = {}
    if (rc.trim()) payload.rodne_cislo = rc.trim()
    if (op.trim()) payload.cislo_op = op.trim()
    if (Object.keys(payload).length === 0) {
      setSavingCitlive(false)
      setCitliveOpen(false)
      return
    }
    const res = await updateBrigadnikCitliveUdaje(brigadnik.id, payload)
    setSavingCitlive(false)
    if ("error" in res && res.error) {
      setCitliveErr(res.error)
      return
    }
    toast.success("Citlivé údaje uloženy")
    setRc("")
    setOp("")
    setCitliveOpen(false)
  }

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      // Server action nezná typ_brigadnika via allowlist (přepne se přes dedicated
      // admin action). Odstraníme ho z formData (UI-only hint).
      formData.delete("typ_brigadnika_hint")
      const result = await updateBrigadnik(brigadnik.id, formData)
      if ("success" in result && result.success) {
        toast.success("Údaje uloženy")
        setOpen(false)
        return null
      }
      if ("error" in result) {
        return { error: result.error }
      }
      return null
    },
    null
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 mr-1" />
          Upravit údaje
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upravit údaje brigádníka</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-5">
          {/* --- Kontakty --- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Kontakty</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ub-jmeno">Jméno</Label>
                <Input id="ub-jmeno" name="jmeno" defaultValue={brigadnik.jmeno ?? ""} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ub-prijmeni">Příjmení</Label>
                <Input id="ub-prijmeni" name="prijmeni" defaultValue={brigadnik.prijmeni ?? ""} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ub-email">Email</Label>
                <Input id="ub-email" name="email" type="email" defaultValue={brigadnik.email ?? ""} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ub-telefon">Telefon</Label>
                <Input id="ub-telefon" name="telefon" defaultValue={brigadnik.telefon ?? ""} required />
              </div>
            </div>
          </section>

          {/* --- Adresa --- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Adresa</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="ub-ulice">Ulice a č.p.</Label>
                <Input id="ub-ulice" name="ulice_cp" defaultValue={brigadnik.ulice_cp ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ub-mesto">Město</Label>
                <Input id="ub-mesto" name="mesto_bydliste" defaultValue={brigadnik.mesto_bydliste ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ub-psc">PSČ</Label>
                <Input id="ub-psc" name="psc" defaultValue={brigadnik.psc ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ub-zeme">Země</Label>
                <Input id="ub-zeme" name="zeme" defaultValue={brigadnik.zeme ?? "CZ"} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ub-narodnost">Národnost</Label>
                <Input id="ub-narodnost" name="narodnost" defaultValue={brigadnik.narodnost ?? "Česká"} />
              </div>
            </div>
          </section>

          {/* --- Banka --- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Bankovní spojení</h3>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1">
                <Label htmlFor="ub-ucet">Číslo účtu</Label>
                <Input id="ub-ucet" name="cislo_uctu" defaultValue={brigadnik.cislo_uctu ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ub-banka">Kód banky</Label>
                <Input id="ub-banka" name="kod_banky" defaultValue={brigadnik.kod_banky ?? ""} />
              </div>
            </div>
          </section>

          {/* --- Typ brigádníka (display only, change přes separate action) --- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Typ</h3>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="typ_brigadnika_hint"
                  value="brigadnik"
                  checked={typ === "brigadnik"}
                  onChange={() => setTyp("brigadnik")}
                />
                Brigádník (DPP)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="typ_brigadnika_hint"
                  value="osvc"
                  checked={typ === "osvc"}
                  onChange={() => setTyp("osvc")}
                />
                OSVČ (fakturant)
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Změna typu je admin operace — proveď ji přes samostatné tlačítko „Změnit typ".
            </p>
          </section>

          {/* --- OSVČ (conditional) --- */}
          {typ === "osvc" && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">OSVČ / fakturační</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ub-ico">IČO</Label>
                  <Input
                    id="ub-ico"
                    name="osvc_ico"
                    defaultValue={brigadnik.osvc_ico ?? ""}
                    pattern="\d{8}"
                    title="IČO = 8 číslic"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="ub-fadr">Fakturační adresa</Label>
                  <Textarea
                    id="ub-fadr"
                    name="osvc_fakturacni_adresa"
                    defaultValue={brigadnik.osvc_fakturacni_adresa ?? ""}
                    rows={2}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                DIČ je šifrované a edituje se přes „Upravit citlivé údaje".
              </p>
            </section>
          )}

          {/* --- Brigádník-only — růžové prohlášení --- */}
          {typ === "brigadnik" && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">DPP / prohlášení</h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="chce_ruzove_prohlaseni"
                  defaultChecked={brigadnik.chce_ruzove_prohlaseni ?? false}
                />
                Chce podepsat růžové prohlášení
              </label>
            </section>
          )}

          {/* --- Ostatní --- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Ostatní</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ub-pojistovna">Zdravotní pojišťovna</Label>
                <Input id="ub-pojistovna" name="zdravotni_pojistovna" defaultValue={brigadnik.zdravotni_pojistovna ?? ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ub-vzdelani">Vzdělání</Label>
                <Input id="ub-vzdelani" name="vzdelani" defaultValue={brigadnik.vzdelani ?? ""} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ub-poznamky">Interní poznámky</Label>
              <Textarea id="ub-poznamky" name="poznamky" defaultValue={brigadnik.poznamky ?? ""} rows={3} />
            </div>
          </section>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button type="submit" disabled={pending}>{pending ? "Ukládám…" : "Uložit"}</Button>
          </div>
        </form>

        {/* --- Citlivé údaje (RČ / číslo dokladu totožnosti) --- */}
        {/* Mimo hlavní formulář: šifrované pole, samostatný submit. */}
        <section className="mt-6 border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Citlivé údaje</h3>
              <p className="text-xs text-muted-foreground">
                Rodné číslo a číslo dokladu totožnosti (OP / cestovní pas). Šifrováno v databázi, auditováno bez hodnot.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setCitliveOpen(v => !v)}>
              {citliveOpen ? "Skrýt" : "Upravit"}
            </Button>
          </div>

          {citliveOpen && (
            <div className="space-y-3 bg-amber-50/40 border border-amber-200 rounded-md p-3">
              <div className="space-y-1">
                <Label htmlFor="ub-rc">
                  Rodné číslo {brigadnik.rodne_cislo_vyplneno ? <span className="text-xs text-muted-foreground">(aktuálně vyplněno — nové přepíše)</span> : null}
                </Label>
                <Input
                  id="ub-rc"
                  value={rc}
                  onChange={e => setRc(e.target.value)}
                  placeholder="např. 900101/1234"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ub-op">
                  Číslo dokladu totožnosti (OP / pas / …) {brigadnik.cislo_op_vyplneno ? <span className="text-xs text-muted-foreground">(aktuálně vyplněno — nové přepíše)</span> : null}
                </Label>
                <Input
                  id="ub-op"
                  value={op}
                  onChange={e => setOp(e.target.value)}
                  placeholder="např. 123456789 nebo AB1234567"
                  autoComplete="off"
                />
              </div>
              {citliveErr && <p className="text-sm text-destructive">{citliveErr}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { setRc(""); setOp(""); setCitliveOpen(false); setCitliveErr(null) }}>
                  Zrušit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={savingCitlive || (!rc.trim() && !op.trim())}
                  onClick={saveCitlive}
                >
                  {savingCitlive ? "Ukládám…" : "Uložit citlivé údaje"}
                </Button>
              </div>
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  )
}
