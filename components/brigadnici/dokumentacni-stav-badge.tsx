import { Badge } from "@/components/ui/badge"

/**
 * F-0013 US-1C-1 — sdílený badge pro {@link v_brigadnik_zakazka_status.dokumentacni_stav}.
 *
 * 6 hodnot:
 *  - `nevyplnene_udaje`  — brigádník ještě nevyplnil dotazník
 *  - `vyplnene_udaje`    — dotazník hotový, DPP ještě nepodepsaná
 *  - `poslana_dpp`       — DPP odeslaná k podpisu
 *  - `podepsana_dpp`     — DPP podepsaná (platí do konce roku)
 *  - `ukoncena_dpp`      — DPP vypršela / manuálně ukončená
 *  - `osvc`              — OSVČ fakturant (bez DPP)
 *
 * Používáno v AssignmentMatrix (F-0015/16), detail brigádníka (F-0013) a
 * dashboard pipeline (F-0017). V F-0013 je komponenta připravená; plné wire-up
 * do matrixu přijde s F-0016.
 */
export type DokumentacniStav =
  | "nevyplnene_udaje"
  | "vyplnene_udaje"
  | "poslana_dpp"
  | "podepsana_dpp"
  | "ukoncena_dpp"
  | "osvc"

type StatusConfig = {
  label: string
  className: string
}

export const DOKUMENTACNI_STAVY: Record<DokumentacniStav, StatusConfig> = {
  nevyplnene_udaje: {
    label: "Nevyplněné údaje",
    className: "bg-red-500/10 text-red-600 border-red-500/20",
  },
  vyplnene_udaje: {
    label: "Vyplněné údaje",
    className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  },
  poslana_dpp: {
    label: "Poslána DPP",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  },
  podepsana_dpp: {
    label: "Podepsaná DPP",
    className: "bg-green-500/10 text-green-600 border-green-500/20",
  },
  ukoncena_dpp: {
    label: "Ukončená DPP",
    className: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  },
  osvc: {
    label: "OSVČ",
    className: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  },
}

type Props = {
  stav: DokumentacniStav | string | null | undefined
  className?: string
}

export function DokumentacniStavBadge({ stav, className }: Props) {
  if (!stav) return null
  const config = DOKUMENTACNI_STAVY[stav as DokumentacniStav]
  if (!config) {
    return (
      <Badge variant="outline" className={className}>
        {stav}
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className={`${config.className} text-xs ${className ?? ""}`}
    >
      {config.label}
    </Badge>
  )
}
