"use client"

import { useActionState } from "react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Pencil } from "lucide-react"
import { updateBrigadnik } from "@/lib/actions/brigadnici"
import { toast } from "sonner"

type Props = {
  brigadnik: {
    id: string
    jmeno: string
    prijmeni: string
    email: string
    telefon: string
    poznamky: string | null
  }
}

export function EditBrigadnikDialog({ brigadnik }: Props) {
  const [open, setOpen] = useState(false)

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await updateBrigadnik(brigadnik.id, formData)
      if (result.success) {
        toast.success("Brigádník upraven")
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
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 mr-1" />
          Upravit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upravit brigádníka</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-jmeno">Jméno</Label>
              <Input id="edit-jmeno" name="jmeno" defaultValue={brigadnik.jmeno} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-prijmeni">Příjmení</Label>
              <Input id="edit-prijmeni" name="prijmeni" defaultValue={brigadnik.prijmeni} required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" name="email" type="email" defaultValue={brigadnik.email} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-telefon">Telefon</Label>
              <Input id="edit-telefon" name="telefon" defaultValue={brigadnik.telefon} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-poznamky">Poznámky</Label>
            <Textarea id="edit-poznamky" name="poznamky" defaultValue={brigadnik.poznamky ?? ""} rows={3} />
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
