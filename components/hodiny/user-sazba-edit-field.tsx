"use client"

import { useState, useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Check, X } from "lucide-react"
import { updateUserSazba } from "@/lib/actions/users"
import { toast } from "sonner"

interface Props {
  userId: string
  initialSazba: number | null
}

/**
 * F-0019 — Admin-only inline edit sazby náborářky.
 * Render pouze pro admina (enforce v parent tabulce).
 */
export function UserSazbaEditField({ userId, initialSazba }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialSazba !== null ? String(initialSazba) : "")
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    const trimmed = value.trim().replace(",", ".")
    let sazba: number | null = null
    if (trimmed.length > 0) {
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0 || n > 9999.99) {
        toast.error("Sazba musí být mezi 0 a 9999,99 Kč/h")
        return
      }
      sazba = Math.round(n * 100) / 100
    }

    startTransition(async () => {
      const res = await updateUserSazba(userId, sazba)
      if ("error" in res) {
        toast.error(res.error)
      } else {
        toast.success("Sazba aktualizována")
        setEditing(false)
      }
    })
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm hover:underline text-left"
      >
        {initialSazba !== null
          ? <>{initialSazba.toLocaleString("cs-CZ")} Kč/h</>
          : <span className="text-muted-foreground italic">Nezadáno — klikni pro zadání</span>
        }
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="např. 250"
        className="h-8 w-28 text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave()
          if (e.key === "Escape") { setEditing(false); setValue(initialSazba !== null ? String(initialSazba) : "") }
        }}
      />
      <span className="text-xs text-muted-foreground">Kč/h</span>
      <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={handleSave} className="h-8 w-8 p-0">
        <Check className="h-3.5 w-3.5 text-green-600" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => { setEditing(false); setValue(initialSazba !== null ? String(initialSazba) : "") }}
        className="h-8 w-8 p-0"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
