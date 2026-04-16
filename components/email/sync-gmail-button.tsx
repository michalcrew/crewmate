"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export function SyncGmailButton() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSync() {
    startTransition(async () => {
      try {
        // First register watch (idempotent)
        await fetch("/api/gmail/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "watch" }),
        })

        // Then sync recent emails
        const res = await fetch("/api/gmail/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync", maxResults: 50 }),
        })

        const data = await res.json()

        if (data.ok) {
          toast.success(`Synchronizováno: ${data.imported} nových, ${data.skipped} přeskočeno`)
          router.refresh()
        } else {
          toast.error(data.error ?? "Synchronizace selhala")
        }
      } catch (error) {
        toast.error("Nepodařilo se synchronizovat emaily")
      }
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSync} disabled={isPending}>
      <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Synchronizuji..." : "Synchronizovat Gmail"}
    </Button>
  )
}
