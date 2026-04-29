"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ChevronUp } from "lucide-react"
import { povysitNahradnika } from "@/lib/actions/akce"
import { toast } from "sonner"

/**
 * Modal pro povýšení náhradníka na přiřazeného (brigadnik / koordinator).
 * Sazba se snapshotuje ze zakázky podle zvolené role (server-side).
 */
export function PovysitNahradnikaDialog({
  prirazeniId,
  brigadnikJmeno,
  koordPovolen = true,
  disabled = false,
}: {
  prirazeniId: string
  brigadnikJmeno: string
  koordPovolen?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handlePovysit(role: "brigadnik" | "koordinator") {
    startTransition(async () => {
      const result = await povysitNahradnika(prirazeniId, role)
      if ("error" in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(
          `${brigadnikJmeno} povýšen/a z náhradníků jako ${role === "koordinator" ? "koordinátor" : "brigádník"}`
        )
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm" variant="outline" disabled={disabled}>
          <ChevronUp className="h-4 w-4 mr-1" />
          Povýšit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Povýšit z náhradníků</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm">
            Vyberte roli pro <strong>{brigadnikJmeno}</strong>. Sazba se nastaví automaticky podle zakázky.
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => handlePovysit("brigadnik")}
              disabled={isPending}
            >
              👷 Brigádník
            </Button>
            <Button
              className="flex-1"
              variant="default"
              onClick={() => handlePovysit("koordinator")}
              disabled={isPending || !koordPovolen}
              title={!koordPovolen ? "Tato zakázka nemá povoleného koordinátora" : undefined}
            >
              👔 Koordinátor
            </Button>
          </div>
          {!koordPovolen && (
            <p className="text-xs text-muted-foreground">
              Tato zakázka nemá povoleného koordinátora — povýšení do role koordinátora není dostupné.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
