"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"
import { sendDotaznikEmail } from "@/lib/actions/formular"
import { toast } from "sonner"

export function SendDotaznikButton({ brigadnikId }: { brigadnikId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await sendDotaznikEmail(brigadnikId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Dotazník odeslán!")
      }
    })
  }

  return (
    <Button onClick={handleClick} disabled={isPending} variant="outline" size="sm">
      <Mail className="h-4 w-4 mr-2" />
      {isPending ? "Odesílám..." : "Odeslat dotazník"}
    </Button>
  )
}
