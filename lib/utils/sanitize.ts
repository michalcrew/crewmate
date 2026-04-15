/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/**
 * Allowed MIME types for file uploads
 */
export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const

export function isAllowedFileType(mimeType: string): boolean {
  return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(mimeType)
}

export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
