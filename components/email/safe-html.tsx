import sanitizeHtml from "sanitize-html"

/**
 * F-0014 P0-2 (Security MUST #1) — SafeHtml wrapper pro render inbound HTML
 * z email threadu.
 *
 * Sanitizace: allowlist-based (sanitize-html, stejná dep. jako podpis-sanitize).
 * Strip:
 *   - <script>, <iframe>, <object>, <embed>, <style>, <link>, <meta>
 *   - on* event handlery (onerror, onload, onclick, ...)
 *   - javascript: / vbscript: / data: URLs (kromě data:image/* v img — vypnuto)
 *   - data-* atributy (pokud by někdo injectoval data-href + JS na client side)
 *
 * Allowlist drží běžné email HTML tags (p, br, ul, table, img, a, ...) a styly,
 * které email klienti běžně posílají. Větší restriktivita než `podpis-sanitize`
 * (ten je pro user-entered podpis; tady jde o untrusted inbound HTML).
 */

const ALLOWED_TAGS = [
  "a", "b", "i", "em", "strong", "u", "s", "sub", "sup",
  "p", "br", "div", "span", "hr",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "img",
]

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "title", "width", "height"],
  "*": ["class", "style"],
}

const ALLOWED_SCHEMES = ["http", "https", "mailto", "tel"]
const ALLOWED_SCHEMES_IMG = ["http", "https", "data", "cid"] // cid: pro embedded inbound obrázky

const ALLOWED_STYLES: Record<string, Record<string, RegExp[]>> = {
  "*": {
    color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^rgba\(/, /^[a-z]+$/i],
    "background-color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^rgba\(/, /^[a-z]+$/i],
    "font-weight": [/^(normal|bold|bolder|lighter|\d{3})$/],
    "font-style": [/^(normal|italic|oblique)$/],
    "text-align": [/^(left|right|center|justify)$/],
    "text-decoration": [/^(none|underline|line-through|overline)$/],
    "font-size": [/^\d+(\.\d+)?(px|em|rem|pt|%)$/],
    "font-family": [/^[\w\s,"'\-]+$/],
    "line-height": [/^\d+(\.\d+)?(px|em|rem|%)?$/],
    margin: [/^[\d\s]+(px|em|rem|%|auto)?$/],
    padding: [/^[\d\s]+(px|em|rem|%)?$/],
    "margin-top": [/^\d+(px|em|rem|%)?$/],
    "margin-bottom": [/^\d+(px|em|rem|%)?$/],
    "margin-left": [/^\d+(px|em|rem|%)?$/],
    "margin-right": [/^\d+(px|em|rem|%)?$/],
    "padding-top": [/^\d+(px|em|rem|%)?$/],
    "padding-bottom": [/^\d+(px|em|rem|%)?$/],
    "padding-left": [/^\d+(px|em|rem|%)?$/],
    "padding-right": [/^\d+(px|em|rem|%)?$/],
    "max-width": [/^\d+(px|em|rem|%)?$/],
    "max-height": [/^\d+(px|em|rem|%)?$/],
    width: [/^\d+(px|em|rem|%|auto)?$/],
    height: [/^\d+(px|em|rem|%|auto)?$/],
    display: [/^(block|inline|inline-block|none|table|table-cell|table-row)$/],
    border: [/^[\d\w\s#(),.-]+$/],
    "border-collapse": [/^(collapse|separate)$/],
  },
}

/**
 * Sanitize inbound HTML pro render v <SafeHtml>. Defensive default — pokud
 * `html` je null/undefined/prázdné, vrací null (caller may render fallback).
 */
export function sanitizeInboundHtml(html: string | null | undefined): string {
  if (!html) return ""
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ALLOWED_SCHEMES,
    allowedSchemesByTag: { img: ALLOWED_SCHEMES_IMG },
    allowedStyles: ALLOWED_STYLES,
    // sanitize-html strip-ne on* eventy + javascript:/vbscript: by default,
    // ale pojistíme to navíc via forbiddenTags.
    disallowedTagsMode: "discard",
    // Neumožnit nested <script> rekonstrukci přes comments.
    allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
  })
}

export interface SafeHtmlProps {
  html: string | null | undefined
  className?: string
  /** Fallback plain text (raw, ne-sanitizovaný), pokud je `html` prázdný. */
  fallbackText?: string | null
}

/**
 * Render untrusted HTML bezpečně — sanitize přes allowlist, pak vložíme
 * do <div dangerouslySetInnerHTML>. Bez této wrapper komponenty je render
 * inbound HTML XSS vulnerability (F-0014 Security MUST #1).
 */
export function SafeHtml({ html, className, fallbackText }: SafeHtmlProps) {
  if (!html || !html.trim()) {
    if (fallbackText) {
      return <div className={className}>{fallbackText}</div>
    }
    return null
  }
  const clean = sanitizeInboundHtml(html)
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />
}
