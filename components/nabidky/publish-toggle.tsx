"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Globe, EyeOff, Loader2 } from "lucide-react"
import { togglePublikovano } from "@/lib/actions/nabidky"
import { cn } from "@/lib/utils"

type Props = {
  id: string
  publikovano: boolean
  typ: string
  variant?: "switch" | "button"
  className?: string
  onChange?: (next: boolean) => void
}

export function PublishToggle({ id, publikovano, typ, variant = "switch", className, onChange }: Props) {
  const [optimistic, setOptimistic] = useState(publikovano)
  const [isPending, startTransition] = useTransition()

  const disabled = typ === "ukoncena" || isPending
  const tooltip = typ === "ukoncena"
    ? "Ukončenou zakázku nelze publikovat"
    : optimistic
      ? "Zakázka je viditelná na /prace — klik stáhne"
      : "Zakázka není na /prace — klik publikuje"

  function handleClick() {
    if (disabled) return
    const next = !optimistic
    setOptimistic(next)
    startTransition(async () => {
      const res = await togglePublikovano(id)
      if (res.error) {
        setOptimistic(!next)
        toast.error(res.error)
      } else {
        onChange?.(next)
        toast.success(next ? "Zakázka publikována na /prace" : "Zakázka stažena z /prace")
      }
    })
  }

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={tooltip}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
          optimistic
            ? "border-green-500/30 bg-green-500/10 text-green-600 hover:bg-green-500/20"
            : "border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100",
          disabled && "opacity-50 cursor-not-allowed",
          className,
        )}
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : optimistic ? <Globe className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        {optimistic ? "Publikováno" : "Nepublikováno"}
      </button>
    )
  }

  // Switch variant
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={tooltip}
      role="switch"
      aria-checked={optimistic}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        optimistic ? "bg-green-500" : "bg-gray-300",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
          optimistic ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
      {isPending && (
        <Loader2 className="absolute -right-5 h-3 w-3 animate-spin text-muted-foreground" />
      )}
    </button>
  )
}
