"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Archive } from "lucide-react"
import { ukoncitNabidku } from "@/lib/actions/nabidky"
import { toast } from "sonner"

type Variant = "full" | "icon"

export function UkoncitButton({
  id,
  nazev,
  variant = "full",
}: {
  id: string
  nazev: string
  variant?: Variant
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      const res = await ukoncitNabidku(id)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success("Zakázka ukončena")
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        {variant === "icon" ? (
          <Button variant="ghost" size="icon" title={`Ukončit zakázku "${nazev}"`}>
            <Archive className="h-4 w-4" />
            <span className="sr-only">Ukončit zakázku</span>
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Archive className="h-4 w-4 mr-1.5" />
            Ukončit zakázku
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ukončit zakázku?</DialogTitle>
          <DialogDescription>
            Zakázka &bdquo;{nazev}&ldquo; bude označena jako ukončená. Nebude možné:
          </DialogDescription>
        </DialogHeader>
        <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
          <li>Přidávat další akce</li>
          <li>Přiřazovat brigádníky na akce</li>
          <li>Upravovat zakázku</li>
          <li>Publikovat ji na /prace</li>
        </ul>
        <p className="text-sm text-muted-foreground">Historie pipeline a dochazky zůstane zachována.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Zrušit</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Ukončuji..." : "Ano, ukončit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
