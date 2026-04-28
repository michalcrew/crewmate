/**
 * Normalizace času z form inputu.
 *
 * Přijme:
 *   - "" / null / undefined / whitespace → null (nevyplněno)
 *   - "HH:MM" nebo "HH:MM:SS" → vrátí "HH:MM"
 *   - cokoliv jiného → null (silently — chyba v UI nemá smysl, akce se uloží bez času)
 *
 * Použití: form input type="time" vrací "HH:MM" string nebo "". Některé prohlížeče
 * (Safari iOS) blokují submit s native validační hláškou „hodnota není validní"
 * pokud se uživateli povede vložit částečnou hodnotu. Přijetím čehokoliv +
 * graceful null fallbackem ten problém obejdeme.
 */
export function normalizeTime(value: unknown): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/)
  if (!match) return null
  return `${match[1]}:${match[2]}`
}
