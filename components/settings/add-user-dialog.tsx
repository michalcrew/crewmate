"use client"

import { useState } from "react"
import { useActionState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus } from "lucide-react"
import { createUser } from "@/lib/actions/users"
import { toast } from "sonner"

export function AddUserDialog() {
  const [open, setOpen] = useState(false)

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await createUser(formData)
      if (result.success) {
        toast.success("Uživatel vytvořen")
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
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Přidat uživatele
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nový uživatel</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nu-jmeno">Jméno *</Label>
              <Input id="nu-jmeno" name="jmeno" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nu-prijmeni">Příjmení *</Label>
              <Input id="nu-prijmeni" name="prijmeni" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-email">Email *</Label>
            <Input id="nu-email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-password">Heslo *</Label>
            <Input id="nu-password" name="password" type="password" minLength={8} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-role">Role *</Label>
            <select id="nu-role" name="role" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="naborar">Náborářka</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button type="submit" disabled={pending}>{pending ? "Vytvářím..." : "Vytvořit"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
