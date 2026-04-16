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
      return await syncRecentEmails(body.maxResults ?? 20)
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
async function syncRecentEmails(maxResults: number) {
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

    if (existing) {
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
      const { data: newThread } = await admin.from("email_threads").insert({
        brigadnik_id: brigadnikId,
        gmail_thread_id: threadId,
        subject,
        status: direction === "inbound" ? "ceka_na_nas" : direction === "outbound" ? "ceka_na_brigadnika" : "nove",
        last_message_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        last_message_preview: subject.slice(0, 100),
        message_count: 1,
      }).select("id").single()

      if (!newThread) continue
      dbThreadId = newThread.id
    }

    // Insert message
    await admin.from("email_messages").insert({
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
    })

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
