"use client"

import { useActionState, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus } from "lucide-react"
import { createAkce } from "@/lib/actions/akce"
import { toast } from "sonner"

type Props = {
  nabidkaId: string
  defaultNazev?: string
  defaultMisto?: string
  defaultKlient?: string
}

export function AddAkceDialog({ nabidkaId, defaultNazev, defaultMisto, defaultKlient }: Props) {
  const [open, setOpen] = useState(false)

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      formData.set("nabidka_id", nabidkaId)
      const result = await createAkce(formData)
      if (result.success) {
        toast.success("Akce přidána")
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
        <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Přidat akci</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nová akce</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="aa-nazev">Název akce *</Label>
            <Input id="aa-nazev" name="nazev" defaultValue={defaultNazev ?? ""} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="aa-datum">Datum *</Label>
              <Input id="aa-datum" name="datum" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aa-misto">Místo</Label>
              <Input id="aa-misto" name="misto" defaultValue={defaultMisto ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="aa-cas-od">Čas od</Label>
              <Input id="aa-cas-od" name="cas_od" type="time" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aa-cas-do">Čas do</Label>
              <Input id="aa-cas-do" name="cas_do" type="time" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="aa-pocet">Počet lidí</Label>
              <Input id="aa-pocet" name="pocet_lidi" type="number" min="1" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aa-klient">Klient</Label>
              <Input id="aa-klient" name="klient" defaultValue={defaultKlient ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aa-poznamky">Poznámky</Label>
            <Textarea id="aa-poznamky" name="poznamky" rows={2} />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button type="submit" disabled={pending}>{pending ? "Ukládám..." : "Přidat akci"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
