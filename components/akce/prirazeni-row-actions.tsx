"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MoreVertical, UserX, UserMinus, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  presunoutDoNahradniku,
  smazatPrirazeni,
  oznacitNepriselFromAdmin,
  undoNepriselFromAdmin,
} from "@/lib/actions/akce"

type Props = {
  prirazeniId: string
  status: "prirazeny" | "nahradnik" | "vypadl"
  /** brigadnik label pro toast / confirm dialog (volitelné) */
  brigadnikName?: string
  /** Pro proběhlé / zrušené akce — dropdown nezobrazujeme akce */
  disabled?: boolean
}

/**
 * Row-level dropdown akce pro řádky v sekcích Tým / Náhradníci / Vypadli
 * v detailu akce. Server actions si interní user.id vytahují samy z auth contextu.
 */
export function PrirazeniRowActions({ prirazeniId, status, brigadnikName, disabled = false }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const label = brigadnikName ? brigadnikName : "Brigádník"

  const handleNeprisel = () => {
    startTransition(async () => {
      const result = await oznacitNepriselFromAdmin(prirazeniId)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`${label} označen/a jako nepřítomný/á`)
        router.refresh()
      }
    })
  }

  const handleDoNahradniku = () => {
    startTransition(async () => {
      const result = await presunoutDoNahradniku(prirazeniId)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`${label} přesunut/a do náhradníků`)
        router.refresh()
      }
    })
  }

  const handleUndo = () => {
    startTransition(async () => {
      const result = await undoNepriselFromAdmin(prirazeniId)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`${label} vrácen/a do týmu`)
        router.refresh()
      }
    })
  }

  const handleSmazat = () => {
    startTransition(async () => {
      const result = await smazatPrirazeni(prirazeniId)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`${label} odebrán/a`)
        setConfirmDeleteOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Akce pro tento řádek"
              disabled={disabled || isPending}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {status === "prirazeny" && (
            <>
              <DropdownMenuItem onClick={handleNeprisel} disabled={isPending}>
                <UserX className="h-4 w-4" />
                Označit jako nepřišel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDoNahradniku} disabled={isPending}>
                <UserMinus className="h-4 w-4" />
                Přesunout do náhradníků
              </DropdownMenuItem>
            </>
          )}
          {status === "nahradnik" && (
            <>
              <DropdownMenuItem onClick={handleNeprisel} disabled={isPending}>
                <UserX className="h-4 w-4" />
                Označit jako nepřišel
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={isPending}
              >
                <Trash2 className="h-4 w-4" />
                Smazat z náhradníků
              </DropdownMenuItem>
            </>
          )}
          {status === "vypadl" && (
            <DropdownMenuItem onClick={handleUndo} disabled={isPending}>
              <RotateCcw className="h-4 w-4" />
              Vrátit zpět do týmu
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat náhradníka?</DialogTitle>
            <DialogDescription>
              Opravdu chcete úplně odebrat „{label}" z této akce? Tuto akci nelze vrátit
              (bude potřeba znovu přidat).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={isPending}
            >
              Zrušit
            </Button>
            <Button variant="destructive" onClick={handleSmazat} disabled={isPending}>
              {isPending ? "Mažu…" : "Smazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
