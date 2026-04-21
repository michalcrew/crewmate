"use client"

import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * F-0017 US-1F-1 — „Zobrazit na webu" button.
 *
 * visible + disabled pokud `!publikovano` nebo `!slug` (UX discoverability D-F0017-04).
 * Otevírá `/prace/[slug]` v novém tabu (external z app pohledu).
 *
 * Varianty:
 *  - `inline`: plný button-like link (pro detail header)
 *  - `icon`: ikona-only (pro table row v list view)
 */

type Variant = "inline" | "icon"

interface Props {
  slug: string | null | undefined
  publikovano: boolean
  variant?: Variant
  className?: string
}

function tooltipText(slug: string | null | undefined, publikovano: boolean): string | null {
  if (!slug) return "Zakázka nemá URL slug"
  if (!publikovano) return "Nabídka není zveřejněna"
  return null
}

export function ZobrazitNabidkuButton({
  slug,
  publikovano,
  variant = "inline",
  className,
}: Props) {
  const tooltip = tooltipText(slug, publikovano)
  const disabled = tooltip !== null
  const href = slug ? `/prace/${slug}` : "#"

  function handleClick(e: React.MouseEvent) {
    if (disabled) {
      e.preventDefault()
      return
    }
    e.stopPropagation()
  }

  if (variant === "icon") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        aria-disabled={disabled}
        title={tooltip ?? "Zobrazit veřejnou nabídku"}
        tabIndex={disabled ? -1 : 0}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          disabled && "pointer-events-none opacity-40",
          className
        )}
      >
        <ExternalLink className="h-4 w-4" />
        <span className="sr-only">Zobrazit na webu</span>
      </a>
    )
  }

  const baseClass =
    "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted"

  if (disabled) {
    return (
      <span
        title={tooltip ?? undefined}
        aria-disabled="true"
        className={cn(baseClass, "opacity-50 cursor-not-allowed", className)}
      >
        <ExternalLink className="h-4 w-4" />
        Zobrazit na webu
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      title="Otevře veřejnou stránku nabídky v novém panelu"
      className={cn(baseClass, className)}
    >
      <ExternalLink className="h-4 w-4" />
      Zobrazit na webu
    </a>
  )
}
