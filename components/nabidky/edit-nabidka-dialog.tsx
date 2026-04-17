"use client"

import { useActionState, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Pencil } from "lucide-react"
import { updateNabidka } from "@/lib/actions/nabidky"
import { TYP_POZICE_OPTIONS, NABIDKA_TYPY, type NabidkaTyp } from "@/lib/constants"
import { toast } from "sonner"

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
    pocet_lidi: number | null
    publikovano: boolean
    koho_hledame?: string | null
    co_nabizime?: string | null
  }
}

export function EditNabidkaDialog({ nabidka }: Props) {
  const [open, setOpen] = useState(false)
  const typLabel = NABIDKA_TYPY[nabidka.typ as NabidkaTyp]?.label ?? nabidka.typ
  const isUkoncena = nabidka.typ === "ukoncena"

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await updateNabidka(nabidka.id, formData)
      if (result.success) {
        toast.success("Zakázka upravena")
        setOpen(false)
        return null
      }
      return result
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
        <form action={formAction} className="space-y-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Odměna</Label>
              <Input name="odmena" defaultValue={nabidka.odmena ?? ""} />
            </div>
            <div className="space-y-2">
              <Label>Počet lidí</Label>
              <Input name="pocet_lidi" type="number" min="1" defaultValue={nabidka.pocet_lidi ?? ""} />
            </div>
          </div>
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
