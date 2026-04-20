"use client"

import { useState } from "react"
import { useActionState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Pencil } from "lucide-react"
import { createDokumentSablona } from "@/lib/actions/dokument-sablony"
import { toast } from "sonner"

export function AddSablonaDialog() {
  const [open, setOpen] = useState(false)

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await createDokumentSablona(formData)
      if (result.success) {
        toast.success("Šablona vytvořena")
        setOpen(false)
        return null
      }
      return result
    },
    null
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nová šablona
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nová šablona dokumentu</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ns-nazev">Název *</Label>
              <Input id="ns-nazev" name="nazev" placeholder="např. DPP šablona — květen 2026" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ns-typ">Typ *</Label>
              <select id="ns-typ" name="typ" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="dpp">DPP (Dohoda o provedení práce)</option>
                <option value="prohlaseni">Prohlášení poplatníka</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ns-od">Platnost od *</Label>
              <Input id="ns-od" name="platnost_od" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ns-do">Platnost do (prázdné = neomezená)</Label>
              <Input id="ns-do" name="platnost_do" type="date" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ns-poznamka">Poznámka</Label>
            <Input id="ns-poznamka" name="poznamka" placeholder="např. Nová verze po konzultaci s právníkem" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ns-obsah">HTML obsah šablony *</Label>
            <p className="text-xs text-muted-foreground">
              Proměnné: {"{{jmeno}}, {{prijmeni}}, {{rodne_cislo}}, {{datum_narozeni}}, {{adresa}}, {{cislo_op}}, {{zdravotni_pojistovna}}, {{cislo_uctu}}, {{kod_banky}}, {{rok}}, {{narodnost}}"}
            </p>
            <Textarea
              id="ns-obsah"
              name="obsah_html"
              rows={12}
              className="font-mono text-xs"
              placeholder="<html><body>...</body></html>"
              required
            />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button type="submit" disabled={pending}>{pending ? "Ukládám..." : "Vytvořit šablonu"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
