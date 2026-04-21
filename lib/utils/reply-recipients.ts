/**
 * F-0014 ADR-1A / D-F0014-01 — Reply-all recipient collection.
 *
 * Čistá (pure) funkce pro derivaci To/Cc při reply-all na existující thread.
 *
 * Pravidla (viz Decisions 02-decisions.md a Architect 03-architect.md):
 *  - Exclude všech adres matching `/@crewmate\.cz$/i` (self + whole team)
 *  - Exclude currentUserEmail (normalizovaně lowercase) — defense-in-depth,
 *    pokud by regex nematchnul (custom domény pro budoucnost viz Q-ARCH-3).
 *  - Dedup case-insensitive (porovnání přes lowercase trim).
 *  - `to` se staví z `from` (reverse flow) pokud není `@crewmate.cz`;
 *    pokud je `from` @crewmate.cz, vypadne a `to` se plní z původních `to`
 *    (fallback na první non-crewmate adresu z přijatého `to`).
 *  - Zbytek (ostatní recipients) jde do `cc` jako seznam, bez duplicit s `to`.
 *
 * Návratový tvar `{ to: string[]; cc: string[] }` — pole `to` je délky 0 nebo 1.
 * Prázdné `to` = volající downgradne na standard reply (disabled reply-all).
 */

const CREWMATE_DOMAIN_RE = /@crewmate\.cz$/i

function normalize(email: string): string {
  return email.trim().toLowerCase()
}

function isCrewmate(email: string): boolean {
  return CREWMATE_DOMAIN_RE.test(normalize(email))
}

export interface CollectReplyAllParams {
  from: string
  to: string[]
  cc: string[]
  currentUserEmail: string
}

export interface CollectReplyAllResult {
  to: string[]
  cc: string[]
}

/**
 * Odvodí recipients pro reply-all. Pure & deterministic.
 *
 * Vstup = poslední inbound zpráva threadu (from + to[] + cc[]) + current user.
 * Výstup = dedupovaný seznam pro reply-all respektující D-F0014-01.
 */
export function collectReplyAllRecipients(
  params: CollectReplyAllParams
): CollectReplyAllResult {
  const currentNorm = normalize(params.currentUserEmail)

  const isBlocked = (email: string): boolean => {
    const n = normalize(email)
    if (!n) return true
    if (n === currentNorm) return true
    if (isCrewmate(email)) return true
    return false
  }

  // Stage 1 — To: primárně původní `from`
  const toList: string[] = []
  const seenTo = new Set<string>()
  if (params.from && !isBlocked(params.from)) {
    const key = normalize(params.from)
    seenTo.add(key)
    toList.push(params.from.trim())
  }

  // Stage 2 — CC: původní to[] + cc[] minus blokované minus `to` z Stage 1
  const ccList: string[] = []
  const seenCc = new Set<string>(seenTo)
  const mergedOther = [...params.to, ...params.cc]
  for (const raw of mergedOther) {
    if (!raw) continue
    if (isBlocked(raw)) continue
    const key = normalize(raw)
    if (seenCc.has(key)) continue
    seenCc.add(key)
    ccList.push(raw.trim())
  }

  // Stage 3 — fallback: pokud `to` prázdné (from byl @crewmate.cz),
  // promote first cc entry do to.
  if (toList.length === 0 && ccList.length > 0) {
    const promoted = ccList.shift() as string
    toList.push(promoted)
  }

  return { to: toList, cc: ccList }
}
