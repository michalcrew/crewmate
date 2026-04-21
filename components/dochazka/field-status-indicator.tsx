"use client"

import { useEffect, useState } from "react"
import { Loader2, Check, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export type FieldStatus = "idle" | "saving" | "saved" | "error"

type Props = {
  status: FieldStatus
  attempt?: number
  onManualRetry?: () => void
  ariaLabel?: string
}

/**
 * F-0018 — tri-state indikátor vedle inputu.
 * - idle → invisible placeholder (stabilní layout, w-5 h-5)
 * - saving → spinner (i během retries)
 * - saved → green check, fade po 1s → idle (handled by parent)
 * - error → red alert icon, clickable → onManualRetry
 */
export function FieldStatusIndicator({ status, attempt, onManualRetry, ariaLabel }: Props) {
  const [visible, setVisible] = useState(status === "saved")

  useEffect(() => {
    if (status === "saved") {
      setVisible(true)
      const t = setTimeout(() => setVisible(false), 1000)
      return () => clearTimeout(t)
    }
    setVisible(true)
  }, [status])

  if (status === "idle") {
    return <span className="inline-block w-5 h-5" aria-hidden="true" />
  }

  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={ariaLabel ?? "Ukládám"}>
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        {attempt && attempt > 1 ? (
          <span className="text-[10px] text-muted-foreground">{attempt}/3</span>
        ) : null}
      </span>
    )
  }

  if (status === "saved") {
    return (
      <Check
        className={`w-5 h-5 text-green-600 transition-opacity duration-500 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        aria-label={ariaLabel ?? "Uloženo"}
      />
    )
  }

  if (status === "error") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="w-5 h-5 p-0 hover:bg-transparent"
        onClick={onManualRetry}
        aria-label={ariaLabel ?? "Chyba ukládání — klikněte pro opakování"}
        title="Nepodařilo se uložit. Klikněte pro další pokus."
      >
        <AlertCircle className="w-5 h-5 text-red-600" />
      </Button>
    )
  }

  return null
}
