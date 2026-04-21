/**
 * F-0017 — Shared filter key contract + predicates.
 *
 * Tento modul definuje typy a pure helpery sdílené mezi:
 *   - `getBrigadnici({ filterKey })` v `lib/actions/brigadnici.ts` (list view)
 *   - `getDashboardAlerts()` v `lib/actions/dashboard.ts` (alert counts)
 *
 * Invariant: STEJNÁ filter key = STEJNÝ predicate = STEJNÝ count.
 * (Parity alert count ↔ list count je QA-kritická — D-F0017-01.)
 *
 * Pozn.: Tento modul nemá "use server" direktivu. Exportuje pure funkce
 * a typy, používané server actions (`brigadnici.ts`, `dashboard.ts`).
 */
import { z } from "zod"

export const ALERT_FILTER_KEYS = [
  "bez_dpp",
  "bez_prohlaseni",
  "bez_dotazniku",
  "osvc_bez_ico",
] as const

export type AlertFilterKey = (typeof ALERT_FILTER_KEYS)[number]

export const AlertFilterKeySchema = z.enum(ALERT_FILTER_KEYS)

/**
 * Shape enriched brigádníka z `getBrigadnici` — jen pole, která predikát čte.
 * (Nechceme couple na celou DB type — list může přidávat sloupce.)
 */
export interface EnrichedBrigadnikForFilter {
  typ_brigadnika?: string | null
  dotaznik_vyplnen?: boolean | null
  chce_ruzove_prohlaseni?: boolean | null
  osvc_ico?: string | null
  // dpp_tento_rok z getBrigadnici: 'zadny' | 'odeslano' | 'podepsano' | 'ukoncena'
  dpp_tento_rok?: string | null
  // prohlaseni_stav z v_brigadnici_aktualni: 'zadny' | 'odeslano' | 'podepsano'
  prohlaseni_stav?: string | null
}

/**
 * Produkuje predikát aplikovatelný na enriched brigádníky.
 * Per F-0017 D-F0017-07: per-rok DPP logika.
 *
 * Pravidla:
 *  - `bez_dpp`: typ_brigadnika != 'osvc' AND dpp_tento_rok NOT IN ('podepsano')
 *    (tj. zadny, odeslano, ukoncena — vypršelá DPP counts urgentně.)
 *  - `bez_prohlaseni`: typ_brigadnika != 'osvc' AND chce_ruzove_prohlaseni = true
 *    AND prohlaseni_stav != 'podepsano'
 *  - `bez_dotazniku`: dotaznik_vyplnen != true (null / false)
 *  - `osvc_bez_ico`: typ_brigadnika = 'osvc' AND (osvc_ico IS NULL OR osvc_ico = '')
 */
export function buildDokumentacniPredicate(
  key: AlertFilterKey,
): (b: EnrichedBrigadnikForFilter) => boolean {
  switch (key) {
    case "bez_dpp":
      return (b) => {
        if (b.typ_brigadnika === "osvc") return false
        const stav = b.dpp_tento_rok ?? "zadny"
        return stav !== "podepsano"
      }
    case "bez_prohlaseni":
      return (b) => {
        if (b.typ_brigadnika === "osvc") return false
        if (b.chce_ruzove_prohlaseni !== true) return false
        const stav = b.prohlaseni_stav ?? "zadny"
        return stav !== "podepsano"
      }
    case "bez_dotazniku":
      return (b) => b.dotaznik_vyplnen !== true
    case "osvc_bez_ico":
      return (b) => {
        if (b.typ_brigadnika !== "osvc") return false
        const ico = (b.osvc_ico ?? "").trim()
        return ico.length === 0
      }
  }
}

export const FILTER_KEY_LABELS: Record<AlertFilterKey, string> = {
  bez_dpp: "Bez DPP",
  bez_prohlaseni: "Bez prohlášení",
  bez_dotazniku: "Bez dotazníku",
  osvc_bez_ico: "OSVČ bez IČO",
}
