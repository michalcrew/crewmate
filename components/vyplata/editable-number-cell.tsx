"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface Props {
  value: number | null
  onSave: (
    newValue: number | null,
  ) => Promise<
    | { success: true; serverValue: number | null }
    | { error: string; locked?: boolean }
  >
  formatDisplay: (v: number | null) => string
  emptyDisplay?: string
  ariaLabel?: string
  className?: string
  disabled?: boolean
  inputSuffix?: string
}

/**
 * Editovatelná číselná buňka s formulářem.
 * Form wrapper zajistí, že Enter v inputu spustí onSubmit (nativní browser chování).
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
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>("")
  const [optimistic, setOptimistic] = useState<number | null>(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

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
    if (disabled || saving) return
    setDraft(optimistic === null ? "" : String(optimistic))
    setEditing(true)
  }

  const parseAndValidate = (raw: string): { ok: true; value: number | null } | { ok: false } => {
    const trimmed = raw.trim()
    if (trimmed === "") return { ok: true, value: null }
    const parsed = Number(trimmed.replace(",", "."))
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Neplatná hodnota — zadejte nezáporné číslo")
      return { ok: false }
    }
    return { ok: true, value: Math.round(parsed * 100) / 100 }
  }

  const performSave = async (newVal: number | null) => {
    if (newVal === optimistic) {
      setEditing(false)
      return
    }
    setEditing(false)
    setOptimistic(newVal)
    setSaving(true)
    try {
      const result = await onSave(newVal)
      if ("error" in result) {
        setOptimistic(value) // rollback
        toast.error(result.error)
        return
      }
      router.refresh()
    } catch (err) {
      console.error("EditableNumberCell save error:", err)
      setOptimistic(value)
      toast.error("Chyba při ukládání")
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseAndValidate(draft)
    if (!parsed.ok) {
      setEditing(false)
      return
    }
    void performSave(parsed.value)
  }

  const handleBlur = () => {
    // Při blur (klik mimo input) ulož stejně jako Enter.
    const parsed = parseAndValidate(draft)
    if (!parsed.ok) {
      setEditing(false)
      return
    }
    void performSave(parsed.value)
  }

  const cancel = () => {
    setEditing(false)
    setDraft("")
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className="contents">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              cancel()
            }
          }}
          className={cn(
            "w-full bg-background border border-primary rounded-sm px-1 py-0.5 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-primary",
            className,
          )}
        />
      </form>
    )
  }

  const displayValue = optimistic === null ? emptyDisplay : formatDisplay(optimistic)

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={disabled || saving}
      aria-label={ariaLabel}
      className={cn(
        "w-full text-xs tabular-nums text-right rounded-sm px-1 py-0.5 transition-colors",
        disabled
          ? "cursor-default text-muted-foreground"
          : "hover:bg-primary/10 cursor-pointer",
        saving && "opacity-50",
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
