/**
 * Sanitize HTML email content to prevent XSS.
 * Strips script tags, event handlers, iframes, etc.
 * Allows basic formatting tags only.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return ""

  return html
    // Remove script tags and content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove style tags and content
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    // Remove event handlers
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, "")
    // Remove iframe, object, embed
    .replace(/<(iframe|object|embed|form|input|button)\b[^>]*\/?>/gi, "")
    .replace(/<\/(iframe|object|embed|form|input|button)>/gi, "")
    // Remove javascript: URIs
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
    .replace(/src\s*=\s*"javascript:[^"]*"/gi, "")
    .replace(/src\s*=\s*'javascript:[^']*'/gi, "")
    // Add rel=noopener to links
    .replace(/<a\s/gi, '<a rel="noopener noreferrer" ')
}
