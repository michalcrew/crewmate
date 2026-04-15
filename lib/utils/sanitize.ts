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

// Extended types for CV/photo uploads from application form
export const ALLOWED_CV_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
] as const

export const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const

export function isAllowedFileType(mimeType: string): boolean {
  return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(mimeType)
}

export function isAllowedCvType(mimeType: string): boolean {
  return (ALLOWED_CV_TYPES as readonly string[]).includes(mimeType)
}

export function isAllowedPhotoType(mimeType: string): boolean {
  return (ALLOWED_PHOTO_TYPES as readonly string[]).includes(mimeType)
}

export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
