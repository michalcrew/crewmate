import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getGmailClient } from "@/lib/email/gmail-client"
import { matchEmailToBrigadnik } from "@/lib/email/email-matcher"

const WEBHOOK_SECRET = process.env.GMAIL_WEBHOOK_SECRET

/**
 * Gmail Pub/Sub push notification webhook.
 * Google sends POST when new emails arrive in team@crewmate.cz.
 */
export async function POST(request: NextRequest) {
  // Validate webhook secret
  const token = request.nextUrl.searchParams.get("token")
  if (WEBHOOK_SECRET && token !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()

    // Decode Pub/Sub message
    const messageData = body?.message?.data
    if (!messageData) {
      return NextResponse.json({ ok: true }) // ACK to prevent retries
    }

    const decoded = JSON.parse(Buffer.from(messageData, "base64").toString())
    const { emailAddress, historyId } = decoded

    if (!emailAddress || !historyId) {
      return NextResponse.json({ ok: true })
    }

    // Process new messages
    await syncNewMessages(historyId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Gmail webhook error:", error)
    // Always return 200 to prevent Pub/Sub retries on processing errors
    return NextResponse.json({ ok: true })
  }
}

async function syncNewMessages(historyId: string) {
  const gmail = getGmailClient()
  const supabase = createAdminClient()

  // Get last known history ID
  const gmailEmail = process.env.GMAIL_USER_EMAIL ?? "team@crewmate.cz"
  const { data: syncState } = await supabase
    .from("gmail_sync_state")
    .select("last_history_id")
    .eq("email_address", gmailEmail)
    .single()

  const startHistoryId = syncState?.last_history_id

  if (!startHistoryId) {
    // First time — just store current history ID, don't process old messages
    await supabase.from("gmail_sync_state").upsert({
      email_address: gmailEmail,
      last_history_id: historyId,
      last_sync_at: new Date().toISOString(),
    }, { onConflict: "email_address" })
    return
  }

  try {
    // Fetch history since last sync
    const historyResponse = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
    })

    const histories = historyResponse.data.history ?? []

    for (const history of histories) {
      const messagesAdded = history.messagesAdded ?? []
      for (const added of messagesAdded) {
        const msgId = added.message?.id
        if (!msgId) continue

        // Check if we already have this message
        const { data: existing } = await supabase
          .from("email_messages")
          .select("id")
          .eq("gmail_message_id", msgId)
          .single()

        if (existing) continue // skip duplicates

        await processGmailMessage(msgId)
      }
    }
  } catch (error) {
    console.error("History sync error:", error)
  }

  // Update sync state
  await supabase.from("gmail_sync_state").upsert({
    email_address: gmailEmail,
    last_history_id: historyId,
    last_sync_at: new Date().toISOString(),
  }, { onConflict: "email_address" })
}

async function processGmailMessage(gmailMessageId: string) {
  const gmail = getGmailClient()
  const supabase = createAdminClient()
  const gmailEmail = process.env.GMAIL_USER_EMAIL ?? "team@crewmate.cz"

  const msg = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "full",
  })

  const headers = msg.data.payload?.headers ?? []
  const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""

  const from = getHeader("From")
  const to = getHeader("To")
  const subject = getHeader("Subject")
  const date = getHeader("Date")
  const threadId = msg.data.threadId ?? ""

  // Determine direction
  const fromEmail = extractEmail(from)
  const direction = fromEmail.toLowerCase() === gmailEmail.toLowerCase() ? "outbound" : "inbound"

  // Extract body
  const bodyHtml = extractBody(msg.data.payload ?? {}, "text/html")
  const bodyText = extractBody(msg.data.payload ?? {}, "text/plain")

  // Match to brigadník
  const matchEmail = direction === "inbound" ? fromEmail : extractEmail(to)
  const brigadnikId = await matchEmailToBrigadnik(matchEmail)

  // Upsert thread
  const { data: existingThread } = await supabase
    .from("email_threads")
    .select("id, message_count")
    .eq("gmail_thread_id", threadId)
    .single()

  let dbThreadId: string

  if (existingThread) {
    dbThreadId = existingThread.id
    const newStatus = direction === "inbound" ? "ceka_na_nas" : "ceka_na_brigadnika"
    await supabase.from("email_threads").update({
      last_message_at: date ? new Date(date).toISOString() : new Date().toISOString(),
      last_message_preview: subject.slice(0, 100),
      message_count: existingThread.message_count + 1,
      status: newStatus,
    }).eq("id", dbThreadId)
  } else {
    const { data: newThread } = await supabase.from("email_threads").insert({
      brigadnik_id: brigadnikId,
      gmail_thread_id: threadId,
      subject,
      status: direction === "inbound" ? "ceka_na_nas" : "ceka_na_brigadnika",
      last_message_at: date ? new Date(date).toISOString() : new Date().toISOString(),
      last_message_preview: subject.slice(0, 100),
      message_count: 1,
    }).select("id").single()
    dbThreadId = newThread!.id
  }

  // Insert message
  const { data: dbMsg } = await supabase.from("email_messages").insert({
    thread_id: dbThreadId,
    gmail_message_id: gmailMessageId,
    direction,
    from_email: fromEmail,
    from_name: extractName(from),
    to_email: extractEmail(to),
    subject,
    body_html: bodyHtml,
    body_text: bodyText,
    sent_at: date ? new Date(date).toISOString() : new Date().toISOString(),
  }).select("id").single()

  // Process attachments
  if (dbMsg && msg.data.payload) {
    await processAttachments(msg.data.payload, gmailMessageId, dbMsg.id, dbThreadId)
  }

  // Audit log
  if (direction === "inbound") {
    await supabase.from("historie").insert({
      brigadnik_id: brigadnikId,
      typ: "email_prijat",
      popis: `Email přijat od ${fromEmail}: ${subject}`,
      metadata: { thread_id: dbThreadId, message_id: dbMsg?.id, from_email: fromEmail },
    })
  }
}

async function processAttachments(
  payload: unknown,
  gmailMessageId: string,
  dbMessageId: string,
  threadId: string,
) {
  const gmail = getGmailClient()
  const supabase = createAdminClient()
  const parts = (payload as { parts?: unknown[] })?.parts ?? []

  for (const part of parts as { filename?: string; mimeType?: string; body?: { attachmentId?: string; size?: number } }[]) {
    if (!part.filename || !part.body?.attachmentId) continue

    // Download attachment from Gmail
    const attachment = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: gmailMessageId,
      id: part.body.attachmentId,
    })

    const data = attachment.data.data
    if (!data) continue

    const buffer = Buffer.from(data, "base64url")
    const storagePath = `email-attachments/${threadId}/${dbMessageId}/${part.filename}`

    // Upload to Supabase Storage
    await supabase.storage
      .from("crewmate-storage")
      .upload(storagePath, buffer, {
        contentType: part.mimeType ?? "application/octet-stream",
        upsert: true,
      })

    // Create attachment record
    await supabase.from("email_attachments").insert({
      message_id: dbMessageId,
      filename: part.filename,
      mime_type: part.mimeType ?? "application/octet-stream",
      size_bytes: part.body.size ?? buffer.length,
      storage_path: storagePath,
    })
  }
}

function extractEmail(header: string): string {
  const match = header.match(/<([^>]+)>/)
  return match?.[1] ?? header.trim()
}

function extractName(header: string): string | null {
  const match = header.match(/^"?([^"<]+)"?\s*</)
  return match?.[1]?.trim() ?? null
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
