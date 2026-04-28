"use client"

import { useTransition } from "react"
import { updatePrirazeniRole } from "@/lib/actions/akce"
import { toast } from "sonner"

/**
 * Toggle role brigadnik ↔ koordinator na řádku přiřazení.
 * - Disabled pokud akce.stav !== 'planovana' nebo nemáme oprávnění.
 * - Koordinator option disabled pokud zakázka nemá sazba_koordinator.
 * - Server akce přepíše sazbu ze zakázky podle nové role (vždy).
 */
export function PrirazeniRoleSelect({
  prirazeniId,
  currentRole,
  disabled = false,
  koordPovolen = true,
}: {
  prirazeniId: string
  currentRole: "brigadnik" | "koordinator" | null
  disabled?: boolean
  koordPovolen?: boolean
}) {
  const [isPending, startTransition] = useTransition()

  function handleChange(newRole: "brigadnik" | "koordinator") {
    if (newRole === currentRole) return
    startTransition(async () => {
      const result = await updatePrirazeniRole(prirazeniId, newRole)
      if ("error" in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Role změněna na ${newRole === "koordinator" ? "koordinátor" : "brigádník"} (sazba se přepíše ze zakázky)`)
      }
    })
  }

  return (
    <select
      className="border rounded px-2 py-1 text-sm bg-background disabled:opacity-50 disabled:cursor-not-allowed"
      value={currentRole ?? ""}
      disabled={disabled || isPending}
      onChange={(e) => handleChange(e.target.value as "brigadnik" | "koordinator")}
      aria-label="Role"
    >
      {currentRole == null && <option value="" disabled>—</option>}
      <option value="brigadnik">👷 Brigádník</option>
      <option value="koordinator" disabled={!koordPovolen}>
        👔 Koordinátor{!koordPovolen ? " (zakázka nemá sazbu)" : ""}
      </option>
    </select>
  )
}
