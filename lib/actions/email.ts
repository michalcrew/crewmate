"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { sendGmailMessage } from "@/lib/email/gmail-send"
import { matchEmailToBrigadnik } from "@/lib/email/email-matcher"
import { sendEmailSchema, updateConversationSchema, threadListSchema } from "@/lib/schemas/email"
import type { SendEmailResult, ThreadListResult, ThreadDetailResult, ConversationStatus } from "@/types/email"

// ============================================================
// sendEmail — Send individual email to brigadník via Gmail API
// ============================================================

export async function sendEmailAction(input: unknown): Promise<SendEmailResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Nepřihlášen" }

  // Validate input
  const parsed = sendEmailSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Neplatný vstup" }
  }

  const { brigadnik_id, subject, body_html, document_type } = parsed.data

  // Get brigadník
  const { data: brigadnik } = await supabase
    .from("brigadnici")
    .select("id, jmeno, prijmeni, email")
    .eq("id", brigadnik_id)
    .single()

  if (!brigadnik) return { success: false, error: "Brigádník nenalezen" }
  if (!brigadnik.email) return { success: false, error: "Brigádník nemá vyplněný email" }

  // Get current user info for signature
  const { data: currentUser } = await supabase
    .from("users")
    .select("id, jmeno, prijmeni, role, podpis, pridat_logo")
    .eq("auth_user_id", user.id)
    .single()

  // Append signature (graceful fallback if user record not found).
  // HF4: pokud user má pridat_logo=true, prepend Crewmate logo img.
  const { buildUserSignature } = await import("@/lib/utils/email-signature")
  const signature = buildUserSignature(currentUser)
  const fullHtml = body_html + signature

  try {
    // Send via Gmail API
    const { messageId, threadId } = await sendGmailMessage({
      to: brigadnik.email,
      subject,
      bodyHtml: fullHtml,
    })

    // Upsert email_thread
    const { data: existingThread } = await supabase
      .from("email_threads")
      .select("id")
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
          message_count: undefined, // will increment below
          status: "ceka_na_brigadnika" as ConversationStatus,
        })
        .eq("id", dbThreadId)

      // Increment message count manually
      const { data: threadData } = await supabase
        .from("email_threads")
        .select("message_count")
        .eq("id", dbThreadId)
        .single()
      if (threadData) {
        await supabase
          .from("email_threads")
          .update({ message_count: threadData.message_count + 1 })
          .eq("id", dbThreadId)
      }
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
        body_text: "", // could strip HTML but not critical
        sent_at: new Date().toISOString(),
        sent_by_user_id: currentUser?.id ?? null,
        document_type: document_type ?? null,
      })
      .select("id")
      .single()

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
      },
    })

    revalidatePath("/app/emaily")
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

// ============================================================
// getThreads — List email threads with optional status filter
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

  // For threads without brigadník, fetch sender info from last inbound message
  const threads = data ?? []
  const unmatchedIds = threads.filter(t => !t.brigadnik_id).map(t => t.id)

  if (unmatchedIds.length > 0) {
    const { data: senderData } = await supabase
      .from("email_messages")
      .select("thread_id, from_email, from_name, direction")
      .in("thread_id", unmatchedIds)
      .eq("direction", "inbound")
      .order("sent_at", { ascending: false })

    // Group by thread_id, take first (latest) inbound message
    const senderMap = new Map<string, { from_email: string; from_name: string | null }>()
    for (const msg of senderData ?? []) {
      if (!senderMap.has(msg.thread_id)) {
        senderMap.set(msg.thread_id, { from_email: msg.from_email, from_name: msg.from_name })
      }
    }

    // Attach sender info to threads
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

  // Get current status for audit
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

  // Get user ID
  const { data: currentUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  // Log to historie
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
