import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getGmailClient, getGmailUserEmail_, getProjectId } from "@/lib/email/gmail-client"
import { matchEmailToBrigadnik } from "@/lib/email/email-matcher"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/gmail/sync — Manual sync + register Gmail watch
 * Called by admin to:
 * 1. Register Gmail push notifications (watch)
 * 2. Import recent emails from Gmail into Crewmate
 */
export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const action = body.action ?? "sync"

  try {
    if (action === "watch") {
      return await registerWatch()
    } else if (action === "sync") {
      return await syncRecentEmails(body.maxResults ?? 20, body.force ?? false)
    } else if (action === "resync") {
      // Delete all threads/messages and reimport with attachments
      const admin = createAdminClient()
      await admin.from("email_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000")
      await admin.from("email_threads").delete().neq("id", "00000000-0000-0000-0000-000000000000")
      return await syncRecentEmails(body.maxResults ?? 50, true)
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
  } catch (error) {
    console.error("Gmail sync error:", error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Sync failed",
    }, { status: 500 })
  }
}

/**
 * Register Gmail push notifications via Pub/Sub
 */
async function registerWatch() {
  const gmail = getGmailClient()
  const projectId = getProjectId()

  const response = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: `projects/${projectId}/topics/gmail-notifications`,
      labelIds: ["INBOX", "SENT"],
    },
  })

  // Store initial historyId
  const admin = createAdminClient()
  const gmailEmail = getGmailUserEmail_()

  await admin.from("gmail_sync_state").upsert({
    email_address: gmailEmail,
    last_history_id: response.data.historyId?.toString() ?? null,
    last_sync_at: new Date().toISOString(),
  }, { onConflict: "email_address" })

  return NextResponse.json({
    ok: true,
    historyId: response.data.historyId,
    expiration: response.data.expiration,
  })
}

/**
 * Sync recent emails from Gmail into Crewmate DB
 */
async function syncRecentEmails(maxResults: number, force: boolean = false) {
  const gmail = getGmailClient()
  const admin = createAdminClient()
  const gmailEmail = getGmailUserEmail_()

  // List recent messages
  const listResponse = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    labelIds: ["INBOX"],
  })

  const messageIds = listResponse.data.messages ?? []
  let imported = 0
  let skipped = 0

  for (const msg of messageIds) {
    if (!msg.id) continue

    // Skip if already imported
    const { data: existing } = await admin
      .from("email_messages")
      .select("id")
      .eq("gmail_message_id", msg.id)
      .single()

    if (existing && !force) {
      skipped++
      continue
    }

    // Fetch full message
    const fullMsg = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    })

    const headers = fullMsg.data.payload?.headers ?? []
    const getHeader = (name: string) =>
      headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""

    const from = getHeader("From")
    const to = getHeader("To")
    const subject = getHeader("Subject")
    const date = getHeader("Date")
    const threadId = fullMsg.data.threadId ?? ""

    // Determine direction
    const fromEmail = extractEmail(from)
    const direction = fromEmail.toLowerCase() === gmailEmail.toLowerCase() ? "outbound" : "inbound"

    // Extract body
    const bodyHtml = extractBody(fullMsg.data.payload ?? {}, "text/html")
    const bodyText = extractBody(fullMsg.data.payload ?? {}, "text/plain")

    // Match to brigadník
    const matchEmail = direction === "inbound" ? fromEmail : extractEmail(to)
    const brigadnikId = await matchEmailToBrigadnik(matchEmail)

    // Upsert thread
    const { data: existingThread } = await admin
      .from("email_threads")
      .select("id, message_count")
      .eq("gmail_thread_id", threadId)
      .single()

    let dbThreadId: string

    if (existingThread) {
      dbThreadId = existingThread.id
      await admin.from("email_threads").update({
        last_message_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        last_message_preview: subject.slice(0, 100),
        message_count: existingThread.message_count + 1,
        status: direction === "inbound" ? "ceka_na_nas" : "ceka_na_brigadnika",
      }).eq("id", dbThreadId)
    } else {
      // For unmatched inbound, store sender info in preview
      const senderName = extractName(from) ?? fromEmail
      const preview = direction === "inbound" && !brigadnikId
        ? `Od: ${senderName}`
        : subject.slice(0, 100)

      const { data: newThread } = await admin.from("email_threads").insert({
        brigadnik_id: brigadnikId,
        gmail_thread_id: threadId,
        subject,
        status: direction === "inbound" ? "ceka_na_nas" : direction === "outbound" ? "ceka_na_brigadnika" : "nove",
        last_message_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        last_message_preview: preview,
        message_count: 1,
      }).select("id").single()

      if (!newThread) continue
      dbThreadId = newThread.id
    }

    // Insert message
    const { data: dbMsg } = await admin.from("email_messages").insert({
      thread_id: dbThreadId,
      gmail_message_id: msg.id,
      direction,
      from_email: fromEmail,
      from_name: extractName(from),
      to_email: extractEmail(to),
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      sent_at: date ? new Date(date).toISOString() : new Date().toISOString(),
    }).select("id").single()

    // Download and store attachments
    if (dbMsg && fullMsg.data.payload) {
      await processAttachments(gmail, admin, fullMsg.data.payload, msg.id, dbMsg.id, dbThreadId)
    }

    imported++
  }

  // Store historyId for future incremental sync
  const profile = await gmail.users.getProfile({ userId: "me" })
  await admin.from("gmail_sync_state").upsert({
    email_address: gmailEmail,
    last_history_id: profile.data.historyId?.toString() ?? null,
    last_sync_at: new Date().toISOString(),
  }, { onConflict: "email_address" })

  return NextResponse.json({ ok: true, imported, skipped, total: messageIds.length })
}

function extractEmail(header: string): string {
  const match = header.match(/<([^>]+)>/)
  return match?.[1] ?? header.trim()
}

function extractName(header: string): string | null {
  const match = header.match(/^"?([^"<]+)"?\s*</)
  return match?.[1]?.trim() ?? null
}

async function processAttachments(
  gmail: ReturnType<typeof getGmailClient>,
  admin: ReturnType<typeof createAdminClient>,
  payload: unknown,
  gmailMessageId: string,
  dbMessageId: string,
  threadId: string,
) {
  const parts = collectAttachmentParts(payload)

  for (const part of parts) {
    if (!part.filename || !part.attachmentId) continue

    try {
      // Download attachment data from Gmail
      const attachment = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: gmailMessageId,
        id: part.attachmentId,
      })

      const data = attachment.data.data
      if (!data) continue

      const buffer = Buffer.from(data, "base64url")
      const storagePath = `email-attachments/${threadId}/${dbMessageId}/${part.filename}`

      // Upload to Supabase Storage
      await admin.storage
        .from("crewmate-storage")
        .upload(storagePath, buffer, {
          contentType: part.mimeType ?? "application/octet-stream",
          upsert: true,
        })

      // Create attachment record
      await admin.from("email_attachments").insert({
        message_id: dbMessageId,
        filename: part.filename,
        mime_type: part.mimeType ?? "application/octet-stream",
        size_bytes: part.size ?? buffer.length,
        storage_path: storagePath,
      })
    } catch (err) {
      console.error(`Attachment download error for ${part.filename}:`, err)
    }
  }
}

function collectAttachmentParts(
  payload: unknown
): { filename: string; attachmentId: string; mimeType?: string; size?: number }[] {
  const result: { filename: string; attachmentId: string; mimeType?: string; size?: number }[] = []
  const p = payload as {
    filename?: string
    mimeType?: string
    body?: { attachmentId?: string; size?: number }
    parts?: unknown[]
  }

  if (p?.filename && p.body?.attachmentId) {
    result.push({
      filename: p.filename,
      attachmentId: p.body.attachmentId,
      mimeType: p.mimeType,
      size: p.body.size,
    })
  }

  if (p?.parts) {
    for (const part of p.parts) {
      result.push(...collectAttachmentParts(part))
    }
  }

  return result
}

function extractBody(payload: unknown, mimeType: string): string {
  const p = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] }
  if (p?.mimeType === mimeType && p.body?.data) {
    return Buffer.from(p.body.data, "base64url").toString("utf-8")
  }
  if (p?.parts) {
    for (const part of p.parts) {
      const result = extractBody(part, mimeType)
      if (result) return result
    }
  }
  return ""
}
