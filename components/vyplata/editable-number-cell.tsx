"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface Props {
  value: number | null
  onSave: (newValue: number | null) => Promise<{ success: true; serverValue: number | null } | { error: string; locked?: boolean }>
  formatDisplay: (v: number | null) => string
  emptyDisplay?: string
  ariaLabel?: string
  className?: string
  disabled?: boolean
  inputSuffix?: string
  step?: string
}

/**
 * Editovatelná číselná buňka.
 * - Click → input mode (autoselect)
 * - Enter / blur → save (pokud se hodnota změnila)
 * - Esc → cancel a vrátit původní
 * - Optimistic UI: lokálně se rovnou změní; po ack ze serveru router.refresh
 *   přepočítá agregace (řádkový + sloupcový součet).
 */
export function EditableNumberCell({
  value,
  onSave,
  formatDisplay,
  emptyDisplay = "—",
  ariaLabel,
  className,
  disabled = false,
  inputSuffix,
  step = "0.01",
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>("")
  const [optimistic, setOptimistic] = useState<number | null>(value)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Sync s prop value když přijde nová data (router.refresh)
  useEffect(() => {
    if (!editing) setOptimistic(value)
  }, [value, editing])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const startEdit = () => {
    if (disabled) return
    setDraft(optimistic === null ? "" : String(optimistic))
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim()
    let newVal: number | null
    if (trimmed === "") {
      newVal = null
    } else {
      const parsed = Number(trimmed.replace(",", "."))
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Neplatná hodnota")
        setEditing(false)
        return
      }
      newVal = Math.round(parsed * 100) / 100
    }

    setEditing(false)
    if (newVal === optimistic) return

    setOptimistic(newVal)
    startTransition(async () => {
      const result = await onSave(newVal)
      if ("error" in result) {
        setOptimistic(value) // rollback
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  const cancel = () => {
    setEditing(false)
    setDraft("")
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step={step}
        min="0"
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          } else if (e.key === "Escape") {
            e.preventDefault()
            cancel()
          }
        }}
        className={cn(
          "w-full bg-background border border-primary rounded-sm px-1 py-0.5 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-primary",
          className,
        )}
      />
    )
  }

  const displayValue = optimistic === null ? emptyDisplay : formatDisplay(optimistic)

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "w-full text-xs tabular-nums text-right rounded-sm px-1 py-0.5 transition-colors",
        disabled
          ? "cursor-default text-muted-foreground"
          : "hover:bg-primary/10 cursor-pointer",
        pending && "opacity-50",
        optimistic === null && "text-muted-foreground/60",
        className,
      )}
    >
      {displayValue}
      {inputSuffix && optimistic !== null && (
        <span className="text-muted-foreground/70 ml-0.5">{inputSuffix}</span>
      )}
    </button>
  )
}
