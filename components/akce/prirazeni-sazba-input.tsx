"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { updatePrirazeniSazba } from "@/lib/actions/akce"
import { toast } from "sonner"

/**
 * Inline editovatelná sazba na řádku přiřazení (Kč/h).
 * - Disabled pokud akce.stav !== 'planovana'.
 * - Save na blur a Enter, zahodit změny na Escape.
 * - Prázdná hodnota → NULL (zobrazí se „—").
 */
export function PrirazeniSazbaInput({
  prirazeniId,
  currentSazba,
  disabled = false,
}: {
  prirazeniId: string
  currentSazba: number | null
  disabled?: boolean
}) {
  const initial = currentSazba != null ? String(currentSazba) : ""
  const [value, setValue] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync z props pokud se změní zvenku (např. po toggle role server přepíše sazbu)
  useEffect(() => {
    setValue(currentSazba != null ? String(currentSazba) : "")
  }, [currentSazba])

  function commit() {
    const trimmed = value.trim()
    const parsed = trimmed === "" ? null : Number(trimmed.replace(",", "."))
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 9999)) {
      toast.error("Sazba musí být mezi 0 a 9999 Kč/h")
      setValue(initial)
      return
    }
    if (parsed === currentSazba) return // žádná změna
    startTransition(async () => {
      const result = await updatePrirazeniSazba(prirazeniId, parsed)
      if ("error" in result && result.error) {
        toast.error(result.error)
        setValue(initial)
      } else {
        toast.success(parsed != null ? `Sazba ${parsed} Kč/h uložena` : "Sazba vymazána")
      }
    })
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        step="0.5"
        min={0}
        max={9999}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            inputRef.current?.blur()
          } else if (e.key === "Escape") {
            e.preventDefault()
            setValue(initial)
            inputRef.current?.blur()
          }
        }}
        disabled={disabled || isPending}
        placeholder="—"
        className="w-20 border rounded px-2 py-1 text-sm bg-background tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Sazba Kč/h"
      />
      <span className="text-xs text-muted-foreground">Kč/h</span>
    </div>
  )
}
