"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Ban, Unlock } from "lucide-react"
import { blokovatBrigadnika, odblokovatBrigadnika } from "@/lib/actions/brigadnici"
import { toast } from "sonner"

/**
 * F-0021a — UI pro blokaci / odblokování brigádníka.
 *
 * Červené tlačítko "Blokovat" otevře dialog s volitelným důvodem.
 * Pokud je brigádník už zablokovaný → tlačítko "Odblokovat" (outline, bez dialogu).
 *
 * Audit entry do historie (typ=brigadnik_zablokovan / brigadnik_odblokovan)
 * se ukládá server-side.
 */

type Props = {
  brigadnikId: string
  zablokovanAt: string | null
  zablokovanDuvod: string | null
}

export function BlokaceActions({ brigadnikId, zablokovanAt, zablokovanDuvod }: Props) {
  const [open, setOpen] = useState(false)
  const [duvod, setDuvod] = useState("")
  const [pending, setPending] = useState(false)

  const jeZablokovan = Boolean(zablokovanAt)

  async function handleBlock() {
    setPending(true)
    const res = await blokovatBrigadnika(brigadnikId, duvod.trim() || undefined)
    setPending(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Brigádník zablokován")
    setOpen(false)
    setDuvod("")
  }

  async function handleUnblock() {
    if (!confirm("Opravdu odblokovat brigádníka? Objeví se znovu v matrix a pipeline listech.")) {
      return
    }
    setPending(true)
    const res = await odblokovatBrigadnika(brigadnikId)
    setPending(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Brigádník odblokován")
  }

  if (jeZablokovan) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleUnblock}
        disabled={pending}
        className="text-destructive hover:text-destructive"
      >
        <Unlock className="h-4 w-4 mr-1" />
        {pending ? "Odblokovávám…" : "Odblokovat"}
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          <Ban className="h-4 w-4 mr-1" />
          Blokovat
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Blokovat brigádníka</DialogTitle>
          <DialogDescription>
            Zablokovaný brigádník se neobjeví v default listech, matrix a pipeline.
            V detailu bude mít červený badge. Blokaci lze kdykoliv zrušit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="blok-duvod">Důvod (volitelné)</Label>
            <Textarea
              id="blok-duvod"
              value={duvod}
              onChange={(e) => setDuvod(e.target.value)}
              placeholder={`např. „3× nepřišel bez omluvy", „konfliktní chování na akci"…`}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              Zobrazí se v detailu brigádníka a v audit logu. Max 500 znaků.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Zrušit
          </Button>
          <Button type="button" variant="destructive" onClick={handleBlock} disabled={pending}>
            {pending ? "Blokuji…" : "Zablokovat"}
          </Button>
        </div>
        {zablokovanDuvod && (
          <p className="text-xs text-muted-foreground mt-2">
            Poslední důvod: {zablokovanDuvod}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Červený badge "Blokován" pro zobrazení v headeru detailu + kartách.
 */
export function BlokovanBadge({ zablokovanDuvod }: { zablokovanDuvod: string | null }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
      <Ban className="h-3 w-3" />
      Blokován
      {zablokovanDuvod && (
        <span className="text-destructive/70 font-normal">— {zablokovanDuvod.slice(0, 80)}{zablokovanDuvod.length > 80 ? "…" : ""}</span>
      )}
    </div>
  )
}
