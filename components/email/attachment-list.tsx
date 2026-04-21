"use client"

import { Paperclip, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type AttachmentUploadState = "pending" | "uploading" | "uploaded" | "error"

export interface ComposerAttachment {
  /** Client-side ID (File object reference) */
  clientId: string
  filename: string
  size_bytes: number
  mime_type: string
  /** Server-assigned UUID once upload completes */
  attachmentId?: string
  storagePath?: string
  state: AttachmentUploadState
  /** 0–100 */
  progress?: number
  error?: string
}

export function AttachmentList({
  items,
  onRemove,
  onRetry,
}: {
  items: ComposerAttachment[]
  onRemove: (clientId: string) => void
  onRetry?: (clientId: string) => void
}) {
  if (items.length === 0) return null

  const totalBytes = items.reduce((sum, it) => sum + it.size_bytes, 0)
  const totalMb = totalBytes / (1024 * 1024)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Paperclip className="h-3 w-3" aria-hidden="true" />
          {items.length} {items.length === 1 ? "soubor" : "soubory"} ({totalMb.toFixed(1)} MB / 25 MB)
        </span>
      </div>
      <ul className="flex flex-col gap-1" role="list">
        {items.map((att) => (
          <li
            key={att.clientId}
            className={cn(
              "flex items-center gap-2 border rounded-lg px-3 py-2 text-sm bg-muted/30",
              att.state === "error" && "border-destructive/50 bg-destructive/5"
            )}
          >
            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{att.filename}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {Math.round(att.size_bytes / 1024)} KB
                </span>
              </div>
              {att.state === "uploading" && (
                <div
                  className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={att.progress ?? 0}
                  aria-label={`Nahrávání ${att.filename}`}
                >
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${att.progress ?? 0}%` }}
                  />
                </div>
              )}
              {att.state === "error" && att.error && (
                <p className="text-xs text-destructive mt-0.5">{att.error}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {att.state === "uploading" && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Nahrává se" />
              )}
              {att.state === "uploaded" && (
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Nahráno" />
              )}
              {att.state === "error" && (
                <>
                  <AlertCircle className="h-4 w-4 text-destructive" aria-label="Chyba" />
                  {onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(att.clientId)}
                      className="text-xs text-primary hover:underline px-1"
                    >
                      Znovu
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => onRemove(att.clientId)}
                aria-label={`Odstranit přílohu ${att.filename}`}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const ATTACHMENT_MAX_PER_FILE_BYTES = 25 * 1024 * 1024 // 25 MB
export const ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024 // 25 MB

export const ATTACHMENT_MIME_WHITELIST: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
] as const

export function validateAttachmentFile(
  file: File,
  currentTotalBytes: number
): { ok: true } | { ok: false; error: string } {
  if (file.size === 0) {
    return { ok: false, error: `${file.name} je prázdný` }
  }
  if (file.size > ATTACHMENT_MAX_PER_FILE_BYTES) {
    return { ok: false, error: `${file.name} je příliš velký (max 25 MB)` }
  }
  if (currentTotalBytes + file.size > ATTACHMENT_MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: `Celková velikost příloh nesmí překročit 25 MB`,
    }
  }
  if (
    file.type &&
    !ATTACHMENT_MIME_WHITELIST.includes(file.type) &&
    !ATTACHMENT_MIME_WHITELIST.some((w) => w === file.type)
  ) {
    return {
      ok: false,
      error: `Typ souboru ${file.type || "neznámý"} není povolen`,
    }
  }
  return { ok: true }
}
