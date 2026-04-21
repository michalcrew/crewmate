import { Badge } from "@/components/ui/badge"
import { Receipt } from "lucide-react"

/**
 * F-0016 US-1D-1 — FakturantBadge
 *
 * Rozlišuje `typ_brigadnika === 'osvc'` (fakturant) od běžného brigádníka.
 * Pro `brigadnik` nebo null nevrací nic.
 *
 * Variants:
 *  - `inline`  — kompaktní, pro matrix / tabulky (ikona + text).
 *  - `prefix`  — ještě menší, před jménem v listu.
 *  - `header`  — větší, pro hero detailu brigádníka.
 *
 * Per Architect open item #7: pro PDF použít plain text "Fakturant (OSVČ)" — tady
 * je to React komponenta (PDF volá text helper v generate-karta-pdf).
 */
type Props = {
  typ: "brigadnik" | "osvc" | string | null | undefined
  variant?: "inline" | "prefix" | "header"
  className?: string
}

export function FakturantBadge({ typ, variant = "inline", className }: Props) {
  if (typ !== "osvc") return null

  const sizing =
    variant === "header"
      ? "text-xs py-0.5 px-2"
      : variant === "prefix"
        ? "text-[10px] py-0 px-1.5"
        : "text-[10px] py-0 px-1.5"

  const iconSize = variant === "header" ? "h-3 w-3" : "h-3 w-3"

  return (
    <Badge
      variant="outline"
      aria-label="Fakturant (OSVČ)"
      title="Fakturant (OSVČ)"
      className={`inline-flex items-center gap-1 bg-amber-500/10 text-amber-700 border-amber-500/30 ${sizing} ${className ?? ""}`}
    >
      <Receipt className={iconSize} aria-hidden="true" />
      <span className={variant === "prefix" ? "hidden sm:inline" : ""}>Fakturant</span>
    </Badge>
  )
}
