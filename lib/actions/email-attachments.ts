"use server"

import { randomUUID } from "node:crypto"
import { z } from "zod"
import { fileTypeFromBuffer } from "file-type"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// ============================================================
// F-0014 1B — Email attachments 2-phase upload (ADR-1B)
//
// Fáze A  uploadEmailAttachmentPending  → Storage `email-attachments/pending/{user_id}/{uuid}_{filename}`
// Fáze B  finalizePendingAttachments    → move do `messages/{message_id}/...` + INSERT email_attachments
// Download: getAttachmentSignedUrl     → signed URL TTL 5 min (D-F0014-10)
//
// Bucket: `email-attachments` (viz migrace 20260423000000_f0014_email_polish.sql).
// createAdminClient() používáme pro Storage operace — bypass RLS (service role),
// viz F-0013 HF4c pattern.
// ============================================================

const STORAGE_BUCKET = "email-attachments"

const MAX_FILE_SIZE = 26_214_400 // 25 MiB

// Product 2.2 MIME whitelist — task spec (strict subset co Backend gate vyžaduje)
const ALLOWED_MIME = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
])

// Blacklist (defense-in-depth — product 2.2)
const BLOCKED_MIME = new Set<string>([
  "application/x-msdownload",
  "application/x-sh",
  "application/javascript",
  "text/html",
  "application/x-msdos-program",
])

function sanitizeFilename(filename: string): string {
  // Strip path traversal + slashes; zachová diakritiku
  return filename
    .replace(/[\\/]/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, 255) || "soubor"
}

const uploadMetaSchema = z.object({
  filename: z.string().min(1, "Chybí název souboru").max(255),
  size: z.coerce.number().int().positive("Soubor musí být > 0 B"),
})

export interface UploadPendingSuccess {
  attachmentDraftId: string   // storage path (source of truth mezi fázemi A/B)
  filename: string            // původní, user-facing
  size: number
  mime_type: string
  storage_path: string        // alias attachmentDraftId
}

export type UploadPendingResult = UploadPendingSuccess | { error: string }

/**
 * F-0014 1B fáze A — upload do pending/ (bez DB row).
 *
 * Vstup: FormData s `file` (File). `filename` a `size` se čtou z File objektu,
 * ale klient je může přepsat (např. diakritika) přes explicitní fields.
 *
 * Návrat: `attachmentDraftId` = storage path, kterou klient předá do sendEmailAction.
 *
 * Validace:
 *  - auth check
 *  - MIME whitelist + blacklist
 *  - size ≤ 25 MiB
 */
export async function uploadEmailAttachmentPending(
  formData: FormData
): Promise<UploadPendingResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const file = formData.get("file")
  if (!(file instanceof File)) return { error: "Chybí soubor" }

  const filenameRaw = (formData.get("filename") as string | null) ?? file.name
  const sizeRaw = (formData.get("size") as string | null) ?? String(file.size)

  const metaParsed = uploadMetaSchema.safeParse({ filename: filenameRaw, size: sizeRaw })
  if (!metaParsed.success) {
    return { error: metaParsed.error.issues[0]?.message ?? "Neplatný vstup" }
  }

  const filename = sanitizeFilename(metaParsed.data.filename)
  const size = metaParsed.data.size

  if (size > MAX_FILE_SIZE) {
    return { error: `Soubor je příliš velký (max 25 MB)` }
  }

  const clientMime = file.type || "application/octet-stream"
  if (BLOCKED_MIME.has(clientMime)) {
    return { error: `Typ souboru ${clientMime} není povolen` }
  }
  if (!ALLOWED_MIME.has(clientMime)) {
    return { error: `Typ souboru ${clientMime} není povolen` }
  }

  // userId pro path — preferujeme internal users.id; fallback na auth.uid()
  const { data: internalUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()
  const userIdForPath = internalUser?.id ?? user.id

  const admin = createAdminClient()
  const uuid = randomUUID()

  const arrayBuffer = await file.arrayBuffer()
  const bytes = Buffer.from(arrayBuffer)

  // F-0014 P0-3 (Security MUST #3) — magic-byte MIME sniffing.
  // `file.type` je client-provided header (spoofable): attacker může nastavit
  // image/png na .exe soubor. `fileTypeFromBuffer` čte binary signature
  // (PE/ELF/PDF/PNG/JPG/ZIP/DOCX/...) a odhalí mismatch.
  //
  // Pozn.: file-type nedetekuje plain text / CSV (žádná magic byte). Pro
  // text/plain MIME z whitelistu fallback povolíme (brigádník si legitimně
  // posílá CV v .txt). Pro ostatní MIMEs detekce MUSÍ uspět a matchovat.
  const detected = await fileTypeFromBuffer(bytes)
  const actualMime: string | null = detected?.mime
    ?? (clientMime === "text/plain" ? "text/plain" : null)

  if (!actualMime) {
    console.error("MIME sniff failed", { clientMime, filename, size })
    return { error: `Typ souboru ${clientMime} není povolen` }
  }
  if (!ALLOWED_MIME.has(actualMime) || BLOCKED_MIME.has(actualMime)) {
    console.error("MIME sniff mismatch (actual not in whitelist)", {
      clientMime,
      actualMime,
      filename,
    })
    return { error: "Obsah souboru neodpovídá povolenému typu (magic-byte check)" }
  }
  // Mismatch client-provided vs. detected → podezřelé, log security event
  // (attacker může mít .exe s MIME image/png). Pro docx/zip je detekce často
  // jen "application/zip" (DOCX = ZIP kontejner), takže povolíme:
  // - clientMime = DOCX + actualMime = ZIP (legitimní)
  // - clientMime = ZIP + actualMime = ZIP
  // Ostatní mismatche reject.
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  const isDocxZipCase = clientMime === DOCX_MIME && actualMime === "application/zip"
  if (clientMime !== actualMime && !isDocxZipCase) {
    console.error("MIME spoof attempt detected", {
      clientMime,
      actualMime,
      filename,
      userId: user.id,
    })
    return { error: "Obsah souboru neodpovídá uvedenému typu" }
  }

  // Použijeme detected MIME pro storage contentType (truthful)
  const mime = actualMime
  const storagePath = `pending/${userIdForPath}/${uuid}_${filename}`

  const { error: uploadError } = await admin
    .storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "no-store",
    })

  if (uploadError) {
    console.error("uploadEmailAttachmentPending storage error:", uploadError)
    return { error: "Nahrání přílohy selhalo" }
  }

  return {
    attachmentDraftId: storagePath,
    filename,
    size,
    mime_type: mime,
    storage_path: storagePath,
  }
}

/**
 * F-0014 1B — signed URL pro download přílohy.
 * TTL 5 min per D-F0014-10.
 *
 * `attachmentId` = UUID řádku `email_attachments`.
 */
export async function getAttachmentSignedUrl(
  attachmentId: string
): Promise<{ url: string; expires_at: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const idParsed = z.string().uuid("Neplatné ID přílohy").safeParse(attachmentId)
  if (!idParsed.success) return { error: idParsed.error.issues[0]?.message ?? "Neplatné ID" }

  const { data: attachment, error: fetchErr } = await supabase
    .from("email_attachments")
    .select("id, storage_path")
    .eq("id", idParsed.data)
    .single()

  if (fetchErr || !attachment) return { error: "Příloha nenalezena" }

  const admin = createAdminClient()
  const TTL_SECONDS = 300 // 5 min

  const { data: signed, error: signedErr } = await admin
    .storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(attachment.storage_path, TTL_SECONDS)

  if (signedErr || !signed?.signedUrl) {
    console.error("getAttachmentSignedUrl error:", signedErr)
    return { error: "Nepodařilo se vygenerovat odkaz" }
  }

  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString()
  return { url: signed.signedUrl, expires_at: expiresAt }
}

/**
 * F-0014 1B fáze B — po úspěšném INSERT email_messages přesun pending → messages/
 * a INSERT email_attachments rows.
 *
 * `pendingDraftIds` jsou Storage paths (= attachmentDraftId z fáze A).
 *
 * Best-effort: pokud move/insert selže pro 1 položku, zbytek pokračuje, chyby
 * logujeme. Důvod: email už je odeslán (Gmail send byl úspěšný), DB by neměla
 * blokovat kompletní flow kvůli 1 selhání.
 *
 * Note: EXPORT this helper (fallbackBuffer for MIME encoding v sendEmailAction —
 * attachment bytes se stahují z pending/).
 */
export async function finalizePendingAttachments(
  pendingDraftIds: string[],
  messageId: string,
  _userId: string
): Promise<void> {
  if (!pendingDraftIds || pendingDraftIds.length === 0) return
  void _userId

  const admin = createAdminClient()

  for (const pendingPath of pendingDraftIds) {
    try {
      if (!pendingPath.startsWith("pending/")) {
        console.error("finalizePendingAttachments: odmítnuta cesta mimo pending/", pendingPath)
        continue
      }

      // Vytáhneme filename (poslední segment po posledním `/`) a velikost přes stat (download size workaround).
      const filenameWithUuid = pendingPath.split("/").pop() || "soubor"
      const filename = filenameWithUuid.replace(/^[0-9a-f-]{36}_/i, "")

      const newPath = `messages/${messageId}/${filenameWithUuid}`

      // Move (copy + delete). Supabase Storage `move` je 1-call.
      const { error: moveErr } = await admin
        .storage
        .from(STORAGE_BUCKET)
        .move(pendingPath, newPath)

      if (moveErr) {
        console.error("finalizePendingAttachments move error:", moveErr, { pendingPath })
        continue
      }

      // Potřebujeme MIME + size — `list` na parent složku.
      const { data: listData } = await admin
        .storage
        .from(STORAGE_BUCKET)
        .list(`messages/${messageId}`, { search: filenameWithUuid })

      const fileRow = listData?.find((f) => f.name === filenameWithUuid)
      const sizeBytes = (fileRow?.metadata as { size?: number } | undefined)?.size ?? 0
      const mimeType =
        (fileRow?.metadata as { mimetype?: string } | undefined)?.mimetype
        ?? "application/octet-stream"

      const { error: insertErr } = await admin
        .from("email_attachments")
        .insert({
          message_id: messageId,
          filename,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          storage_path: newPath,
        })

      if (insertErr) {
        console.error("finalizePendingAttachments insert error:", insertErr, { newPath })
      }
    } catch (err) {
      console.error("finalizePendingAttachments unexpected:", err)
    }
  }
}

/**
 * Helper — stáhne pending soubor z Storage a vrátí Buffer + meta pro MIME
 * encoding do Gmailu. Volá sendEmailAction PŘED samotným Gmail send.
 */
export async function fetchPendingForMime(
  pendingDraftIds: string[]
): Promise<Array<{ filename: string; content: Buffer; mimeType: string }>> {
  if (!pendingDraftIds || pendingDraftIds.length === 0) return []

  const admin = createAdminClient()
  const result: Array<{ filename: string; content: Buffer; mimeType: string }> = []

  for (const path of pendingDraftIds) {
    if (!path.startsWith("pending/")) continue

    const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(path)
    if (error || !data) {
      console.error("fetchPendingForMime download error:", error, { path })
      continue
    }

    const arrayBuffer = await data.arrayBuffer()
    const content = Buffer.from(arrayBuffer)
    const filenameWithUuid = path.split("/").pop() || "soubor"
    const filename = filenameWithUuid.replace(/^[0-9a-f-]{36}_/i, "")
    const mimeType = data.type || "application/octet-stream"

    result.push({ filename, content, mimeType })
  }

  return result
}
