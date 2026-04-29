"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MoreVertical, UserX, UserMinus, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  const [zruseniOpen, setZruseniOpen] = useState(false)
  const [duvod, setDuvod] = useState("")

  const label = brigadnikName ? brigadnikName : "Brigádník"

  const handleZrusenyConfirm = () => {
    const trimmed = duvod.trim()
    if (!trimmed) {
      toast.error("Zadejte důvod zrušení")
      return
    }
    startTransition(async () => {
      const result = await oznacitNepriselFromAdmin(prirazeniId, trimmed)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`${label} označen/a jako zrušený/á`)
        setZruseniOpen(false)
        setDuvod("")
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
              <DropdownMenuItem onClick={() => setZruseniOpen(true)} disabled={isPending}>
                <UserX className="h-4 w-4" />
                Označit jako zrušený
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDoNahradniku} disabled={isPending}>
                <UserMinus className="h-4 w-4" />
                Přesunout do náhradníků
              </DropdownMenuItem>
            </>
          )}
          {status === "nahradnik" && (
            <>
              <DropdownMenuItem onClick={() => setZruseniOpen(true)} disabled={isPending}>
                <UserX className="h-4 w-4" />
                Označit jako zrušený
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

      <Dialog open={zruseniOpen} onOpenChange={(o) => { setZruseniOpen(o); if (!o) setDuvod("") }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Označit jako zrušený</DialogTitle>
            <DialogDescription>
              {label} bude označen/a jako zrušený/á (status „vypadl"). Případná zapsaná docházka se vymaže.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="duvod-zruseni">Důvod zrušení *</Label>
            <Textarea
              id="duvod-zruseni"
              value={duvod}
              onChange={(e) => setDuvod(e.target.value)}
              placeholder="Např. nemoc, omluva, nepřišel bez omluvy…"
              rows={3}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setZruseniOpen(false); setDuvod("") }}
              disabled={isPending}
            >
              Zrušit
            </Button>
            <Button onClick={handleZrusenyConfirm} disabled={isPending || !duvod.trim()}>
              {isPending ? "Ukládám…" : "Označit jako zrušený"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
