"use client"

import { useState } from "react"

/**
 * F-0016 — shared star rating (hvězdičky 1-5).
 *
 * Dva režimy:
 *  - Display (read-only): `<StarRating value={4.2} count={7} />` — půlpixelová
 *    rounded approximation pro prumerne_hodnoceni.
 *  - Picker: `<StarRating value={rating} onChange={setRating} />` — klik + klávesy
 *    šipky, keyboard accessible.
 */

type Props = {
  value: number | null | undefined
  count?: number | null
  onChange?: (v: number) => void
  size?: "sm" | "md"
  className?: string
  showCount?: boolean
}

export function StarRating({ value, count, onChange, size = "sm", className, showCount = true }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const isInteractive = typeof onChange === "function"
  const num = value == null ? 0 : Number(value)
  const rounded = Math.round((isInteractive ? (hover ?? num) : num))

  if (!isInteractive && num <= 0) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className ?? ""}`}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Bez hodnocení</span>
      </span>
    )
  }

  const textSize = size === "md" ? "text-lg" : "text-sm"

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className ?? ""}`}
      role={isInteractive ? "radiogroup" : undefined}
      aria-label={isInteractive ? "Hodnocení 1 až 5 hvězdiček" : `Hodnocení ${num.toFixed(1)} z 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= rounded
        const common = `${textSize} ${filled ? "text-amber-400" : "text-gray-300"}`
        if (!isInteractive) {
          return (
            <span key={star} className={common} aria-hidden="true">★</span>
          )
        }
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rounded === star}
            aria-label={`${star} hvězdiček`}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault()
                onChange?.(Math.min(5, (value ?? 0) + 1))
              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault()
                onChange?.(Math.max(1, (value ?? 0) - 1))
              }
            }}
            className={`${common} cursor-pointer hover:scale-110 transition-transform`}
          >
            ★
          </button>
        )
      })}
      {!isInteractive && showCount && (
        <span className="ml-1 text-xs text-muted-foreground tabular-nums">
          {num.toFixed(1)}
          {count != null && count > 0 ? ` (${count})` : ""}
        </span>
      )}
    </span>
  )
}
