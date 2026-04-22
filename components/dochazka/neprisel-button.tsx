"use client"

import { useState, useTransition } from "react"
import { UserX, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
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
  markNepriselBrigadnik,
  undoNepriselBrigadnik,
  type DochazkaEditor,
} from "@/lib/actions/dochazka"

type BaseProps = {
  prirazeniId: string
  brigadnikName: string
  editor: DochazkaEditor
  onDone?: () => void
}

export function NepriselButton({ prirazeniId, brigadnikName, editor, onDone }: BaseProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await markNepriselBrigadnik(prirazeniId, editor)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`${brigadnikName} označen/a jako nepřítomný/á`)
        setOpen(false)
        onDone?.()
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 text-red-600 border-red-200 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        <UserX className="w-4 h-4 mr-1" /> Nepřišel
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Označit jako nepřítomného?</DialogTitle>
            <DialogDescription>
              Označit „{brigadnikName}" jako nepřítomného? Status se změní na „vypadl"
              a případně zapsaný příchod/odchod se vymaže.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? "Ukládám…" : "Označit nepřítomného"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function UndoNepriselButton({ prirazeniId, brigadnikName, editor, onDone }: BaseProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await undoNepriselBrigadnik(prirazeniId, editor)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`${brigadnikName} vrácen/a k „přiřazený"`)
        setOpen(false)
        onDone?.()
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10"
        onClick={() => setOpen(true)}
      >
        <RotateCcw className="w-4 h-4 mr-1" /> Vrátit zpět
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vrátit zpět k „přiřazený"?</DialogTitle>
            <DialogDescription>
              Vrátit „{brigadnikName}" zpět k statusu „přiřazený"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Zrušit
            </Button>
            <Button onClick={handleConfirm} disabled={pending}>
              {pending ? "Ukládám…" : "Vrátit zpět"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
