import sanitizeHtml from "sanitize-html"

/**
 * F-0013 ADR-1E: Allowlist-based sanitizace pro `users.podpis`.
 *  - Povolené tagy: b, i, u, br, p, span, a (http/https/mailto/tel), strong, em.
 *  - Zahozené: <script>, <iframe>, <object>, <embed>, <style>, on* eventy, javascript: URLs.
 *  - Uplatňuje se na save ve Server Action `updateUserPodpis` (defense-in-depth).
 */
const PODPIS_ALLOWED_TAGS = [
  "b",
  "i",
  "u",
  "br",
  "p",
  "span",
  "a",
  "strong",
  "em",
  // HF4 — img povolen pouze s src whitelistem níže (Crewmate logo).
  "img",
]

const PODPIS_ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "target", "rel"],
  span: ["style"],
  p: ["style"],
  img: ["src", "alt", "style"],
}

const PODPIS_ALLOWED_SCHEMES = ["http", "https", "mailto", "tel"]

/**
 * HF4 — povolené host-patterns pro <img src>. Kdokoliv jiný než tento seznam
 * je vyfiltrován (strip celého tagu). Hard-coded, ne z user input.
 */
const IMG_SRC_ALLOWLIST: readonly RegExp[] = [
  /^https:\/\/crewmate-steel\.vercel\.app\/logo-crewmate\.svg$/i,
  /^https:\/\/crewmate\.cz\/logo-crewmate\.svg$/i,
  /^http:\/\/localhost:\d+\/logo-crewmate\.svg$/i,
]

export interface SanitizedPodpis {
  sanitized: string
  stripped: number // počet znaků odstraněných sanitizací
  hadInjection: boolean
}

export function sanitizePodpis(raw: string): SanitizedPodpis {
  const rawLen = raw.length
  const sanitized = sanitizeHtml(raw, {
    allowedTags: PODPIS_ALLOWED_TAGS,
    allowedAttributes: PODPIS_ALLOWED_ATTRS,
    allowedSchemes: PODPIS_ALLOWED_SCHEMES,
    // Strip style attribute values with javascript: / expression()
    allowedStyles: {
      "*": {
        color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^[a-z]+$/i],
        "background-color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^[a-z]+$/i],
        "font-weight": [/^(normal|bold|bolder|lighter|\d{3})$/],
        "font-style": [/^(normal|italic|oblique)$/],
        "max-height": [/^\d{1,3}px$/],
        "max-width": [/^\d{1,3}px$/],
        display: [/^(block|inline|inline-block|none)$/],
        "margin-bottom": [/^\d{1,3}px$/],
      },
    },
    // HF4: img je povolen pouze pokud src passuje allowlist.
    exclusiveFilter: (frame) => {
      if (frame.tag === "img") {
        const src = frame.attribs?.src ?? ""
        return !IMG_SRC_ALLOWLIST.some((re) => re.test(src))
      }
      return false
    },
    // Remove any on* handler and javascript: hrefs by default.
  })
  const stripped = Math.max(0, rawLen - sanitized.length)
  return {
    sanitized,
    stripped,
    hadInjection: stripped > 0,
  }
}
