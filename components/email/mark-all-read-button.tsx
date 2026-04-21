"use client"

import { useTransition } from "react"
import { CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { markAllRead } from "@/lib/actions/email-inbox"
import { toast } from "sonner"

/** F-0014 1F — batch „Označit vše jako přečtené". */
export function MarkAllReadButton() {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const res = await markAllRead()
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.count > 0
          ? `${res.count} ${res.count === 1 ? "konverzace označena" : "konverzací označeno"} jako přečtené`
          : "Vše už je přečtené"
      )
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      aria-label="Označit všechny konverzace jako přečtené"
    >
      <CheckCheck className="h-4 w-4 mr-2" aria-hidden="true" />
      {isPending ? "Označuji…" : "Označit vše jako přečtené"}
    </Button>
  )
}
