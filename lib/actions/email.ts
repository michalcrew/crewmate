"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendGmailMessage } from "@/lib/email/gmail-send"
import { sendEmailSchema, updateConversationSchema, threadListSchema, replyThreadSchema } from "@/lib/schemas/email"
import { collectReplyAllRecipients } from "@/lib/utils/reply-recipients"
import { finalizePendingAttachments, fetchPendingForMime } from "./email-attachments"
import type { SendEmailResult, ThreadListResult, ThreadDetailResult, ConversationStatus } from "@/types/email"

// F-0014 fixup (P0-1): re-exports byly odebrány — Next.js / Turbopack odmítá
// `export { foo } from "./other"` v "use server" souboru (jen async fn allowed).
// Konzumenti importují z nativních umístění:
//   markThreadRead / archiveThread / markAllRead → "@/lib/actions/email-inbox"
//   uploadEmailAttachmentPending / getAttachmentSignedUrl → "@/lib/actions/email-attachments"

// ============================================================
// sendEmail — Send individual email to brigadník via Gmail API
// F-0014: rozšířeno o thread_id, cc[], attachment_draft_ids[]
// ============================================================

export async function sendEmailAction(input: unknown): Promise<SendEmailResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Nepřihlášen" }

  // Accept FormData or plain object
  const raw = input instanceof FormData ? parseSendEmailFormData(input) : input

  const parsed = sendEmailSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Neplatný vstup" }
  }

  const {
    brigadnik_id,
    subject,
    body_html,
    document_type,
    thread_id: inputThreadId,
    cc,
    attachment_draft_ids,
  } = parsed.data

  // Get brigadník
  const { data: brigadnik } = await supabase
    .from("brigadnici")
    .select("id, jmeno, prijmeni, email")
    .eq("id", brigadnik_id)
    .single()

  if (!brigadnik) return { success: false, error: "Brigádník nenalezen" }
  if (!brigadnik.email) return { success: false, error: "Brigádník nemá vyplněný email" }

  // Get current user info for signature
  // HF: authenticated SELECT občas vrací prázdno (RLS edge case, stejný
  // pattern jako F-0013 HF4c + F-0015 HF). Admin client fallback po auth check.
  const admin = createAdminClient()
  const { data: currentUser } = await admin
    .from("users")
    .select("id, jmeno, prijmeni, role, podpis, pridat_logo")
    .eq("auth_user_id", user.id)
    .single()

  // Append signature (graceful fallback if user record not found).
  // HF4: pokud user má pridat_logo=true, prepend Crewmate logo img.
  const { buildUserSignature } = await import("@/lib/utils/email-signature")
  const signature = buildUserSignature(currentUser)
  const fullHtml = body_html + signature

  // F-0014 ADR-1A: look up existing thread to pass gmail_thread_id into Gmail API
  let gmailThreadIdForReply: string | undefined
  if (inputThreadId) {
    const { data: replyThread } = await supabase
      .from("email_threads")
      .select("gmail_thread_id")
      .eq("id", inputThreadId)
      .single()
    gmailThreadIdForReply = replyThread?.gmail_thread_id ?? undefined
  }

  // F-0014 1B — pull pending attachments (if any) before Gmail send
  let mimeAttachments: Array<{ filename: string; content: Buffer; mimeType: string }> = []
  if (attachment_draft_ids && attachment_draft_ids.length > 0) {
    mimeAttachments = await fetchPendingForMime(attachment_draft_ids)
    const totalSize = mimeAttachments.reduce((s, a) => s + a.content.length, 0)
    if (totalSize > 26_214_400) {
      return { success: false, error: "Celková velikost příloh překračuje 25 MB" }
    }
  }

  try {
    const { messageId, threadId } = await sendGmailMessage({
      to: brigadnik.email,
      cc: cc && cc.length > 0 ? cc : undefined,
      subject,
      bodyHtml: fullHtml,
      threadId: gmailThreadIdForReply,
      attachments: mimeAttachments.length > 0 ? mimeAttachments : undefined,
    })

    // Upsert email_thread
    const { data: existingThread } = await supabase
      .from("email_threads")
      .select("id, message_count")
      .eq("gmail_thread_id", threadId)
      .single()

    let dbThreadId: string

    if (existingThread) {
      dbThreadId = existingThread.id
      await supabase
        .from("email_threads")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: subject.slice(0, 100),
          message_count: existingThread.message_count + 1,
          status: "ceka_na_brigadnika" as ConversationStatus,
        })
        .eq("id", dbThreadId)
    } else {
      const { data: newThread, error: threadError } = await supabase
        .from("email_threads")
        .insert({
          brigadnik_id,
          gmail_thread_id: threadId,
          subject,
          status: "ceka_na_brigadnika" as ConversationStatus,
          last_message_at: new Date().toISOString(),
          last_message_preview: subject.slice(0, 100),
          message_count: 1,
        })
        .select("id")
        .single()

      if (threadError || !newThread) {
        console.error("Thread creation error:", threadError)
        return { success: false, error: "Email odeslán, ale nepodařilo se uložit konverzaci" }
      }
      dbThreadId = newThread.id
    }

    // Insert email_message
    const { data: msg } = await supabase
      .from("email_messages")
      .insert({
        thread_id: dbThreadId,
        gmail_message_id: messageId,
        direction: "outbound",
        from_email: process.env.GMAIL_USER_EMAIL ?? "team@crewmate.cz",
        from_name: currentUser ? `${currentUser.jmeno} ${currentUser.prijmeni}` : null,
        to_email: brigadnik.email,
        subject,
        body_html: fullHtml,
        body_text: "",
        sent_at: new Date().toISOString(),
        sent_by_user_id: currentUser?.id ?? null,
        document_type: document_type ?? null,
      })
      .select("id")
      .single()

    // F-0014 1B — finalize attachments: move pending/ → messages/ + INSERT DB rows.
    if (msg && attachment_draft_ids && attachment_draft_ids.length > 0) {
      await finalizePendingAttachments(attachment_draft_ids, msg.id, user.id)
    }

    // Log to historie
    await supabase.from("historie").insert({
      brigadnik_id,
      user_id: currentUser?.id ?? null,
      typ: "email_odeslan",
      popis: `Email odeslán: ${subject}`,
      metadata: {
        thread_id: dbThreadId,
        message_id: msg?.id,
        to_email: brigadnik.email,
        document_type,
        cc: cc ?? [],
        attachment_count: attachment_draft_ids?.length ?? 0,
      },
    })

    revalidatePath("/app/emaily")
    revalidatePath(`/app/emaily/${dbThreadId}`)
    revalidatePath(`/app/brigadnici/${brigadnik_id}`)

    return { success: true, thread_id: dbThreadId, message_id: msg?.id }
  } catch (error) {
    console.error("Gmail send error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Nepodařilo se odeslat email",
    }
  }
}

/** Helper — parse FormData for sendEmailAction. CC + attachment_draft_ids přes JSON string. */
function parseSendEmailFormData(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of fd.entries()) {
    if (key === "cc" || key === "attachment_draft_ids" || key === "attachment_ids") {
      if (typeof val === "string" && val.length > 0) {
        try {
          out[key] = JSON.parse(val)
        } catch {
          out[key] = []
        }
      }
      continue
    }
    out[key] = val
  }
  return out
}

// ============================================================
// F-0014 ADR-1A — replyToThread
// Načte poslední inbound message, složí recipients (reply-all optional),
// pošle přes Gmail API s threadId → zachová thread v Gmailu.
// ============================================================

export async function replyToThread(
  threadId: string,
  body: string,
  options?: { replyAll?: boolean; attachmentDraftIds?: string[] }
): Promise<{ success: true; thread_id: string; message_id?: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const parsed = replyThreadSchema.safeParse({
    thread_id: threadId,
    body_html: body,
    reply_all: options?.replyAll ?? false,
    attachment_draft_ids: options?.attachmentDraftIds,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatný vstup" }

  const replyAll = parsed.data.reply_all === true

  const { data: thread } = await supabase
    .from("email_threads")
    .select("id, gmail_thread_id, subject, brigadnik_id")
    .eq("id", threadId)
    .single()

  if (!thread) return { error: "Konverzace nenalezena" }

  // Poslední inbound message (ORDER BY created_at DESC LIMIT 1)
  // Poznámka: email_messages neobsahuje cc_emails sloupec — CC headery
  // z příchozích Gmail zpráv zatím nejsou ukládány (F-0011 scope).
  // Reply-all tak prozatím staví CC jen z to_email multirecipient parse.
  const { data: lastInbound } = await supabase
    .from("email_messages")
    .select("id, from_email, to_email, subject")
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lastInbound) {
    return { error: "V této konverzaci není žádná příchozí zpráva, nelze odpovědět" }
  }

  // Current user email (pro reply-all exclusion) + internal users row pro signature
  // HF: admin client přímo (authenticated SELECT občas vrací data ale bez
  // všech sloupců / unexpected null). Pattern z F-0013 HF4c + F-0015 HF.
  let userEmail = user.email ?? ""
  const admin = createAdminClient()
  const { data: internalUser } = await admin
    .from("users")
    .select("id, jmeno, prijmeni, role, podpis, pridat_logo, email")
    .eq("auth_user_id", user.id)
    .single()
  if (internalUser && typeof (internalUser as { email?: string }).email === "string") {
    userEmail = (internalUser as { email?: string }).email || userEmail
  }

  // to_email je TEXT field — může obsahovat vícenásobné adresy oddělené ",".
  const toRaw = typeof lastInbound.to_email === "string" ? lastInbound.to_email : ""
  const toArr: string[] = toRaw
    .split(/[,;]/)
    .map((part) => {
      const match = part.match(/<([^>]+)>/)
      return (match ? match[1]! : part).trim()
    })
    .filter((e) => e.length > 0 && e.includes("@"))

  const ccArr: string[] = [] // F-0011 schema — CC neukládáme; post-MVP

  let toList: string[]
  let ccList: string[]

  if (replyAll) {
    const recipients = collectReplyAllRecipients({
      from: lastInbound.from_email,
      to: toArr,
      cc: ccArr,
      currentUserEmail: userEmail,
    })
    toList = recipients.to
    ccList = recipients.cc
  } else {
    toList = lastInbound.from_email ? [lastInbound.from_email] : []
    ccList = []
  }

  if (toList.length === 0) {
    return { error: "Nelze určit příjemce pro odpověď" }
  }

  // Signature
  const { buildUserSignature } = await import("@/lib/utils/email-signature")
  const signature = buildUserSignature(internalUser)
  const fullHtml = body + signature

  // Subject: "Re: ..." (pokud původní ještě nezačíná Re:)
  const origSubject = (lastInbound.subject as string | null) ?? thread.subject ?? ""
  const subject = /^re:\s/i.test(origSubject) ? origSubject : `Re: ${origSubject}`

  // Attachments
  let mimeAttachments: Array<{ filename: string; content: Buffer; mimeType: string }> = []
  if (parsed.data.attachment_draft_ids && parsed.data.attachment_draft_ids.length > 0) {
    mimeAttachments = await fetchPendingForMime(parsed.data.attachment_draft_ids)
    const total = mimeAttachments.reduce((s, a) => s + a.content.length, 0)
    if (total > 26_214_400) return { error: "Celková velikost příloh překračuje 25 MB" }
  }

  try {
    const { messageId, threadId: gmailThreadId } = await sendGmailMessage({
      to: toList[0] as string,
      cc: ccList.length > 0 ? ccList : undefined,
      subject,
      bodyHtml: fullHtml,
      threadId: thread.gmail_thread_id,
      attachments: mimeAttachments.length > 0 ? mimeAttachments : undefined,
    })

    // Update thread message_count + last_message_at
    const { data: threadRow } = await supabase
      .from("email_threads")
      .select("message_count")
      .eq("id", threadId)
      .single()

    await supabase
      .from("email_threads")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: subject.slice(0, 100),
        message_count: (threadRow?.message_count ?? 0) + 1,
        status: "ceka_na_brigadnika" as ConversationStatus,
      })
      .eq("id", threadId)

    const { data: msg } = await supabase
      .from("email_messages")
      .insert({
        thread_id: threadId,
        gmail_message_id: messageId,
        direction: "outbound",
        from_email: process.env.GMAIL_USER_EMAIL ?? "team@crewmate.cz",
        from_name: internalUser ? `${internalUser.jmeno} ${internalUser.prijmeni}` : null,
        to_email: toList[0],
        subject,
        body_html: fullHtml,
        body_text: "",
        sent_at: new Date().toISOString(),
        sent_by_user_id: internalUser?.id ?? null,
      })
      .select("id")
      .single()

    if (msg && parsed.data.attachment_draft_ids && parsed.data.attachment_draft_ids.length > 0) {
      await finalizePendingAttachments(parsed.data.attachment_draft_ids, msg.id, user.id)
    }

    // Historie
    if (thread.brigadnik_id) {
      await supabase.from("historie").insert({
        brigadnik_id: thread.brigadnik_id,
        user_id: internalUser?.id ?? null,
        typ: "email_odeslan",
        popis: `Odpověď odeslána: ${subject}`,
        metadata: {
          thread_id: threadId,
          message_id: msg?.id,
          reply_all: replyAll,
          cc: ccList,
        },
      })
    }

    revalidatePath("/app/emaily")
    revalidatePath(`/app/emaily/${threadId}`)
    if (thread.brigadnik_id) revalidatePath(`/app/brigadnici/${thread.brigadnik_id}`)

    // Gmail threadId returned for debugging / consistency check
    void gmailThreadId

    return { success: true, thread_id: threadId, message_id: msg?.id }
  } catch (err) {
    console.error("replyToThread error:", err)
    return { error: err instanceof Error ? err.message : "Nepodařilo se odeslat odpověď" }
  }
}

// ============================================================
// getThreads — List email threads with optional status filter
// F-0014: podporuje archived filter (default archived=false)
// ============================================================

export async function getThreads(input?: unknown): Promise<ThreadListResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { threads: [], total: 0 }

  const params = threadListSchema.parse(input ?? {})
  const { status_filter, page, limit } = params
  const offset = (page - 1) * limit

  let query = supabase
    .from("email_threads")
    .select("*, brigadnik:brigadnici(id, jmeno, prijmeni, email)", { count: "exact" })
    .order("last_message_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status_filter) {
    query = query.eq("status", status_filter)
  }

  const { data, count, error } = await query

  if (error) {
    console.error("getThreads error:", error)
    return { threads: [], total: 0 }
  }

  const threads = data ?? []
  const unmatchedIds = threads.filter(t => !t.brigadnik_id).map(t => t.id)

  if (unmatchedIds.length > 0) {
    const { data: senderData } = await supabase
      .from("email_messages")
      .select("thread_id, from_email, from_name, direction")
      .in("thread_id", unmatchedIds)
      .eq("direction", "inbound")
      .order("sent_at", { ascending: false })

    const senderMap = new Map<string, { from_email: string; from_name: string | null }>()
    for (const msg of senderData ?? []) {
      if (!senderMap.has(msg.thread_id)) {
        senderMap.set(msg.thread_id, { from_email: msg.from_email, from_name: msg.from_name })
      }
    }

    for (const thread of threads) {
      if (!thread.brigadnik_id) {
        const sender = senderMap.get(thread.id)
        if (sender) {
          (thread as Record<string, unknown>).sender_name = sender.from_name
          ;(thread as Record<string, unknown>).sender_email = sender.from_email
        }
      }
    }
  }

  return {
    threads,
    total: count ?? 0,
  }
}

// ============================================================
// getThread — Get single thread with all messages
// ============================================================

export async function getThread(threadId: string): Promise<ThreadDetailResult | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: thread } = await supabase
    .from("email_threads")
    .select("*, brigadnik:brigadnici(id, jmeno, prijmeni, email)")
    .eq("id", threadId)
    .single()

  if (!thread) return null

  const { data: messages, error: msgError } = await supabase
    .from("email_messages")
    .select("*, attachments:email_attachments(*)")
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: true })

  if (msgError) {
    console.error("getThread messages error:", msgError)
  }

  return {
    thread,
    messages: messages ?? [],
  }
}

// ============================================================
// updateConversationStatus — Change thread status manually
// ============================================================

export async function updateConversationStatus(input: unknown) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const parsed = updateConversationSchema.safeParse(input)
  if (!parsed.success) return { error: "Neplatný vstup" }

  const { thread_id, status } = parsed.data

  const { data: thread } = await supabase
    .from("email_threads")
    .select("status, brigadnik_id")
    .eq("id", thread_id)
    .single()

  if (!thread) return { error: "Konverzace nenalezena" }

  await supabase
    .from("email_threads")
    .update({ status })
    .eq("id", thread_id)

  const { data: currentUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  await supabase.from("historie").insert({
    brigadnik_id: thread.brigadnik_id,
    user_id: currentUser?.id,
    typ: "konverzace_zmena_stavu",
    popis: `Stav konverzace změněn: ${thread.status} → ${status}`,
    metadata: { thread_id, old_status: thread.status, new_status: status },
  })

  revalidatePath("/app/emaily")
  return { success: true }
}

// ============================================================
// F-0014 1D — unified komunikace timeline
// ============================================================

const KOMUNIKACE_TYPES = [
  "email_odeslan",
  "email_prijaty",
  "dotaznik_odeslan",
  "dotaznik_vyplnen",
  "dotaznik_token_invalidovan",
  "dpp_odeslana",
  "dpp_podepsana",
  "prohlaseni_odeslano",
] as const

export type KomunikaceTypZaznamu = (typeof KOMUNIKACE_TYPES)[number]

export interface KomunikaceTimelineItem {
  id: string
  typ: string
  popis: string
  created_at: string
  metadata: Record<string, unknown> | null
}

export async function getKomunikaceTimeline(
  brigadnikId: string,
  options?: { limit?: number; offset?: number }
): Promise<KomunikaceTimelineItem[]> {
  const supabase = await createClient()
  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0

  const { data, error } = await supabase
    .from("historie")
    .select("id, typ, popis, created_at, metadata")
    .eq("brigadnik_id", brigadnikId)
    .in("typ", KOMUNIKACE_TYPES as unknown as string[])
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error("getKomunikaceTimeline error:", error)
    return []
  }
  return (data ?? []) as KomunikaceTimelineItem[]
}
