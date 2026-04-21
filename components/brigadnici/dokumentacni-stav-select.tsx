"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { DOKUMENTACNI_STAVY, type DokumentacniStav } from "./dokumentacni-stav-badge"
import { setDokumentacniStavManual } from "@/lib/actions/brigadnici"

/**
 * F-0016 follow-up: inline dropdown pro manuální změnu dokumentačního stavu.
 *
 * Použito v:
 *  - /app/brigadnici — sloupec „Stav" (nahrazuje původní Stav + DPP split)
 *  - AssignmentMatrix v nabídky detail
 *  - Akce detail — sloupec „Stav" v tabulce přiřazených brigádníků
 *
 * UI: native `<select>` pro kompaktnost + mobile-friendly. Barvy z DOKUMENTACNI_STAVY.
 * Po změně: optimistic local state + server action + revalidate (toast success/error).
 */

const OPTIONS: { value: DokumentacniStav; label: string }[] = [
  { value: "nevyplnene_udaje", label: DOKUMENTACNI_STAVY.nevyplnene_udaje.label },
  { value: "vyplnene_udaje",   label: DOKUMENTACNI_STAVY.vyplnene_udaje.label },
  { value: "poslana_dpp",      label: DOKUMENTACNI_STAVY.poslana_dpp.label },
  { value: "podepsana_dpp",    label: DOKUMENTACNI_STAVY.podepsana_dpp.label },
  { value: "ukoncena_dpp",     label: DOKUMENTACNI_STAVY.ukoncena_dpp.label },
  { value: "osvc",             label: DOKUMENTACNI_STAVY.osvc.label },
]

type Props = {
  brigadnikId: string
  current: DokumentacniStav | string | null | undefined
  /** Volitelný suffix pro aria-label (např. jméno brigádníka). */
  ariaLabel?: string
  /** Kompaktní varianta (menší padding, menší font) pro matrix karty. */
  compact?: boolean
  /** Disable editaci (např. pro zrušenou akci / zakázku). */
  disabled?: boolean
}

export function DokumentacniStavSelect({ brigadnikId, current, ariaLabel, compact, disabled }: Props) {
  const [value, setValue] = useState<string>(current ?? "nevyplnene_udaje")
  const [pending, startTransition] = useTransition()

  // Sync local state s `current` prop — po server revalidate se page re-renderuje s novými
  // props, ale useState initial se nespustí znovu. Bez tohoto efektu zůstává dropdown
  // na starém local state a další klik počítá s jinou baseline než DB (rollback misclick fail).
  useEffect(() => {
    if (current && current !== value && !pending) {
      setValue(current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  const config = DOKUMENTACNI_STAVY[value as DokumentacniStav]
  const styleClass = config?.className ?? "bg-muted text-muted-foreground border-muted"

  return (
    <select
      aria-label={ariaLabel ? `Dokumentační stav ${ariaLabel}` : "Dokumentační stav"}
      value={value}
      disabled={disabled || pending}
      onChange={(e) => {
        const next = e.target.value as DokumentacniStav
        const prev = value
        if (next === prev) return // žádná změna
        setValue(next) // optimistic
        startTransition(async () => {
          try {
            const res = await setDokumentacniStavManual(brigadnikId, next)
            if (res && "error" in res && res.error) {
              setValue(prev)
              toast.error(`Nepodařilo se změnit stav: ${res.error}`)
              return
            }
            toast.success(`Stav změněn: ${DOKUMENTACNI_STAVY[next].label}`)
          } catch (err) {
            setValue(prev)
            toast.error(`Chyba při změně stavu: ${err instanceof Error ? err.message : String(err)}`)
          }
        })
      }}
      className={[
        "rounded-md border text-xs font-medium cursor-pointer",
        compact ? "px-1.5 py-0.5" : "px-2 py-1",
        styleClass,
        disabled ? "opacity-60 cursor-not-allowed" : "",
        pending ? "opacity-70" : "",
      ].filter(Boolean).join(" ")}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
