"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Mail, AlertTriangle } from "lucide-react"
import { sendDotaznikEmail } from "@/lib/actions/formular"
import { toast } from "sonner"

/**
 * F-0014 1C + 1E — „Odeslat dotazník" s warning-flow pro resend.
 *
 * Flow:
 * 1. Klik → volá sendDotaznikEmail(id) (bez force).
 * 2. Pokud server vrátí warning 'existing_token' → otevře potvrzovací dialog.
 * 3. Uživatel odsouhlasí → volá sendDotaznikEmail(id, { force: true }).
 */
export function SendDotaznikDialog({
  brigadnikId,
  brigadnikEmail,
  label = "Odeslat dotazník",
  variant = "outline",
}: {
  brigadnikId: string
  brigadnikEmail?: string | null
  label?: string
  variant?: "default" | "outline" | "secondary" | "ghost"
}) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [pendingAgeLabel, setPendingAgeLabel] = useState<string | null>(null)

  const disabled = !brigadnikEmail

  function attemptSend(force: boolean) {
    startTransition(async () => {
      const res = await sendDotaznikEmail(brigadnikId, force)
      if ("success" in res && res.success) {
        toast.success(`Dotazník odeslán${brigadnikEmail ? ` na ${brigadnikEmail}` : ""}`)
        setOpen(false)
        setPendingAgeLabel(null)
        return
      }
      if ("hasPending" in res && res.hasPending) {
        setPendingAgeLabel(res.pendingAge ?? "nějaký čas")
        setOpen(true)
        return
      }
      if ("error" in res) {
        toast.error(res.error)
      }
    })
  }

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={() => attemptSend(false)}
        disabled={isPending || disabled}
        aria-label="Odeslat dotazník brigádníkovi"
        title={disabled ? "Brigádník nemá email" : undefined}
      >
        <Mail className="h-4 w-4 mr-2" aria-hidden="true" />
        {isPending ? "Odesílám…" : label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
              Opakované odeslání dotazníku
            </DialogTitle>
            <DialogDescription>
              Brigádník má nevyplněný dotazník odeslaný{" "}
              <strong>{pendingAgeLabel ?? "před nějakou dobou"}</strong>.
              Chcete poslat nový? Starý odkaz přestane fungovat.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Zrušit
            </Button>
            <Button
              onClick={() => attemptSend(true)}
              disabled={isPending}
            >
              {isPending ? "Odesílám…" : "Odeslat nový"}
            </Button>
          </div>
        </DialogContent>
        {/* Trigger je standalone tlačítko výše — dialog otevřeme programatically */}
        <DialogTrigger className="hidden" aria-hidden="true" />
      </Dialog>
    </>
  )
}
