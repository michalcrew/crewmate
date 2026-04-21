/**
 * F-0019 — Flexibilní parser pro zápis trvání práce v minutách.
 *
 * Kontrakt (architect §3):
 *   parseMinutes("90")      → 90
 *   parseMinutes("1:30")    → 90
 *   parseMinutes("1h 30m")  → 90
 *   parseMinutes("1h30m")   → 90
 *   parseMinutes("1.5h")    → 90
 *   parseMinutes("1,5h")    → 90 (Czech desetinná čárka)
 *   parseMinutes("30m")     → 30
 *   parseMinutes("1h")      → 60
 *   parseMinutes("0")       → null (zero)
 *   parseMinutes("-10")     → null (negative)
 *   parseMinutes("25h")     → null (> 1440, db CHECK)
 *   parseMinutes("1:75")    → null (min > 59)
 *   parseMinutes("abc")     → null (unparseable)
 *
 * Výsledek vždy satisfies DB CHECK `trvani_minut > 0 AND <= 1440`.
 * Čistá funkce bez side-effectů — lze unit-testovat.
 */

const MAX_MINUTES = 1440 // 24h per-entry cap (db CHECK)

/**
 * Parses a human-friendly duration string into minutes.
 *
 * @returns integer minutes in (0, 1440], or null if invalid.
 */
export function parseMinutes(input: string): number | null {
  if (typeof input !== "string") return null

  const raw = input.trim().toLowerCase().replace(/,/g, ".")
  if (raw.length === 0) return null

  // 1) HH:MM (e.g. "1:30", "12:45")
  const colon = raw.match(/^(\d+):(\d{1,2})$/)
  if (colon) {
    const h = Number.parseInt(colon[1]!, 10)
    const m = Number.parseInt(colon[2]!, 10)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    if (m >= 60) return null
    return clamp(h * 60 + m)
  }

  // 2) "Xh Ym" / "XhYm" / "1.5h 30m" — hours + minutes kombinace
  const hMin = raw.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d+)\s*m?$/)
  if (hMin) {
    const hPart = Number.parseFloat(hMin[1]!)
    const mPart = Number.parseInt(hMin[2]!, 10)
    if (!Number.isFinite(hPart) || !Number.isFinite(mPart)) return null
    if (mPart >= 60) return null
    return clamp(Math.round(hPart * 60) + mPart)
  }

  // 3) "Xh" / "1.5h" — jen hodiny
  const onlyH = raw.match(/^(\d+(?:\.\d+)?)\s*h$/)
  if (onlyH) {
    const hPart = Number.parseFloat(onlyH[1]!)
    if (!Number.isFinite(hPart)) return null
    return clamp(Math.round(hPart * 60))
  }

  // 4) "Xm" / "90" — jen minuty (m suffix optional)
  const onlyM = raw.match(/^(\d+)\s*m?$/)
  if (onlyM) {
    const mPart = Number.parseInt(onlyM[1]!, 10)
    if (!Number.isFinite(mPart)) return null
    return clamp(mPart)
  }

  return null
}

function clamp(n: number): number | null {
  if (!Number.isFinite(n)) return null
  if (n <= 0) return null
  if (n > MAX_MINUTES) return null
  return n
}

/**
 * Canonical display of minutes.
 *
 *   formatMinutes(45)  → "45m"
 *   formatMinutes(60)  → "1h"
 *   formatMinutes(90)  → "1h 30m"
 *   formatMinutes(120) → "2h"
 *   formatMinutes(765) → "12h 45m"
 *
 * For `< 60` vrací `"{n}m"`. Pro celé hodiny bez minut `"{h}h"`.
 * Jinak `"{h}h {m}m"`.
 */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m"
  const m = Math.round(minutes)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (rem === 0) return `${h}h`
  return `${h}h ${rem}m`
}

/**
 * Shared cost-calc helper (architect §7).
 * Rounds to 2 decimal places; `null` sazba → 0.
 */
export function computeNakladKc(
  minut: number,
  sazba: number | null | undefined,
): number {
  const s = sazba ?? 0
  if (!Number.isFinite(minut) || !Number.isFinite(s)) return 0
  return Math.round(((minut / 60) * s) * 100) / 100
}
