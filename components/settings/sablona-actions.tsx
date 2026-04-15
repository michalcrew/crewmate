"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { toggleSablonaActive } from "@/lib/actions/dokument-sablony"
import { toast } from "sonner"

export function SablonaActions({ sablonaId, aktivni }: { sablonaId: string; aktivni: boolean }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant={aktivni ? "outline" : "default"}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await toggleSablonaActive(sablonaId, !aktivni)
          if (result.error) toast.error(result.error)
          else toast.success(aktivni ? "Šablona deaktivována" : "Šablona aktivována")
        })
      }}
    >
      {isPending ? "..." : aktivni ? "Deaktivovat" : "Aktivovat"}
    </Button>
  )
}
