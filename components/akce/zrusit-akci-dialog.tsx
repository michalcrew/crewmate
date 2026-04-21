"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { zrusitAkci } from "@/lib/actions/akce"

/**
 * F-0015 US-1C — ZrusitAkciDialog
 *
 * 3 use-cases (list row menu, detail header, matrix header).
 * Props:
 *  - open/onOpenChange: řízení z parent komponenty
 *  - akceId, akceName, akceDate: metadata pro zobrazení
 *  - onSuccess: volitelný callback po úspěšném zrušení
 *
 * Guards (backend):
 *  - HARD BLOCK: akce s kompletní docházkou (odchod NOT NULL) → error toast
 *  - Idempotent: akce už zrušená → silent success
 */
export function ZrusitAkciDialog({
  open,
  onOpenChange,
  akceId,
  akceName,
  akceDate,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  akceId: string
  akceName: string
  akceDate: string
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [duvod, setDuvod] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      const res = await zrusitAkci(akceId, duvod.trim() || undefined)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.affected_prirazeni > 0
          ? `Akce zrušena (${res.affected_prirazeni} brigádník${res.affected_prirazeni === 1 ? "" : res.affected_prirazeni < 5 ? "ci" : "ů"} přesunuto do 'Vypadl')`
          : "Akce zrušena"
      )
      onOpenChange(false)
      setDuvod("")
      onSuccess?.()
      router.refresh()
    })
  }

  function handleCancel() {
    if (isPending) return
    onOpenChange(false)
    setDuvod("")
  }

  const dateStr = new Date(akceDate).toLocaleDateString("cs-CZ")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zrušit akci?</DialogTitle>
          <DialogDescription>
            Opravdu zrušit akci <strong>&bdquo;{akceName}&ldquo;</strong> ({dateStr})?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            <p className="font-medium mb-1">Co se stane:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Akce změní stav na <strong>Zrušená</strong>.</li>
              <li>Všichni přiřazení brigádníci přejdou do stavu <strong>Vypadl</strong>.</li>
              <li>Historie (briefingy, docházka bez odchodu) zůstane zachovaná.</li>
              <li>Akci nelze znovu obnovit (reopen zrušené je out of scope).</li>
            </ul>
          </div>

          <div>
            <label htmlFor={`duvod-${akceId}`} className="text-sm font-medium">
              Důvod zrušení (nepovinné)
            </label>
            <Textarea
              id={`duvod-${akceId}`}
              value={duvod}
              onChange={(e) => setDuvod(e.target.value)}
              rows={3}
              placeholder="Např. klient odvolal akci, nedostatek brigádníků…"
              className="mt-1"
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isPending}>
            Zrušit
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
            aria-label={`Potvrdit zrušení akce ${akceName}`}
          >
            {isPending ? "Ruším…" : "Ano, zrušit akci"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
