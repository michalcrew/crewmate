"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { toggleUserActive } from "@/lib/actions/users"
import { toast } from "sonner"

export function UserActions({ userId, aktivni }: { userId: string; aktivni: boolean }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant={aktivni ? "outline" : "default"}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await toggleUserActive(userId, !aktivni)
          if (result.error) toast.error(result.error)
          else toast.success(aktivni ? "Uživatel deaktivován" : "Uživatel aktivován")
        })
      }}
    >
      {isPending ? "..." : aktivni ? "Deaktivovat" : "Aktivovat"}
    </Button>
  )
}
