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
]

const PODPIS_ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "target", "rel"],
  span: ["style"],
  p: ["style"],
}

const PODPIS_ALLOWED_SCHEMES = ["http", "https", "mailto", "tel"]

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
        "font-weight": [/^(normal|bold|bolder|lighter|\d{3})$/],
        "font-style": [/^(normal|italic|oblique)$/],
      },
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
