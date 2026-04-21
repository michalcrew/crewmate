"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// ============================================================
// F-0014 1F — Inbox state actions (ADR-1F)
//  markThreadRead  — toggle is_read
//  archiveThread   — toggle archived + archived_at/_by
//  markAllRead     — single UPDATE pro všechny nepřečtené
//
// Všechny akce jsou idempotentní, atomic na úrovni 1 UPDATE,
// logují do historie.
// ============================================================

const threadIdSchema = z.string().uuid("Neplatné ID konverzace")

async function getInternalUserId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: internal } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  if (internal?.id) return internal.id

  // F-0013 HF4c pattern — admin client fallback pro users lookup
  const admin = createAdminClient()
  const { data: adminRow } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()
  return adminRow?.id ?? null
}

export async function markThreadRead(
  threadId: string,
  isRead: boolean
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const idParsed = threadIdSchema.safeParse(threadId)
  if (!idParsed.success) return { error: idParsed.error.issues[0]?.message ?? "Neplatné ID" }

  const { data: thread } = await supabase
    .from("email_threads")
    .select("id, brigadnik_id, is_read")
    .eq("id", idParsed.data)
    .single()

  if (!thread) return { error: "Konverzace nenalezena" }

  if (thread.is_read === isRead) {
    // no-op (idempotent)
    return { success: true }
  }

  const { error: updErr } = await supabase
    .from("email_threads")
    .update({ is_read: isRead })
    .eq("id", idParsed.data)

  if (updErr) {
    console.error("markThreadRead update error:", updErr)
    return { error: "Nepodařilo se uložit stav" }
  }

  // Audit log (pokud je thread přiřazen k brigádníkovi)
  const internalUserId = await getInternalUserId(supabase)
  if (thread.brigadnik_id) {
    await supabase.from("historie").insert({
      brigadnik_id: thread.brigadnik_id,
      user_id: internalUserId,
      typ: "konverzace_zmena_stavu",
      popis: isRead ? "Konverzace označena jako přečtená" : "Konverzace označena jako nepřečtená",
      metadata: { thread_id: idParsed.data, action: "mark_read", is_read: isRead },
    })
  }

  revalidatePath("/app/emaily")
  revalidatePath(`/app/emaily/${idParsed.data}`)
  return { success: true }
}

export async function archiveThread(
  threadId: string,
  archived: boolean
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const idParsed = threadIdSchema.safeParse(threadId)
  if (!idParsed.success) return { error: idParsed.error.issues[0]?.message ?? "Neplatné ID" }

  const { data: thread } = await supabase
    .from("email_threads")
    .select("id, brigadnik_id, archived")
    .eq("id", idParsed.data)
    .single()

  if (!thread) return { error: "Konverzace nenalezena" }
  if (thread.archived === archived) return { success: true }

  const internalUserId = await getInternalUserId(supabase)

  const updatePayload = archived
    ? {
        archived: true,
        archived_at: new Date().toISOString(),
        archived_by: internalUserId,
      }
    : {
        archived: false,
        archived_at: null,
        archived_by: null,
      }

  const { error: updErr } = await supabase
    .from("email_threads")
    .update(updatePayload)
    .eq("id", idParsed.data)

  if (updErr) {
    console.error("archiveThread update error:", updErr)
    return { error: "Nepodařilo se archivovat konverzaci" }
  }

  if (thread.brigadnik_id) {
    await supabase.from("historie").insert({
      brigadnik_id: thread.brigadnik_id,
      user_id: internalUserId,
      typ: "konverzace_zmena_stavu",
      popis: archived ? "Konverzace archivována" : "Konverzace obnovena z archivu",
      metadata: { thread_id: idParsed.data, action: archived ? "archive" : "unarchive" },
    })
  }

  revalidatePath("/app/emaily")
  revalidatePath(`/app/emaily/${idParsed.data}`)
  return { success: true }
}

export async function markAllRead(): Promise<
  { success: true; count: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { data: before, error: selErr } = await supabase
    .from("email_threads")
    .select("id", { count: "exact" })
    .eq("is_read", false)
    .eq("archived", false)

  if (selErr) {
    console.error("markAllRead count error:", selErr)
    return { error: "Nepodařilo se načíst konverzace" }
  }

  const count = before?.length ?? 0
  if (count === 0) {
    return { success: true, count: 0 }
  }

  const { error: updErr } = await supabase
    .from("email_threads")
    .update({ is_read: true })
    .eq("is_read", false)
    .eq("archived", false)

  if (updErr) {
    console.error("markAllRead update error:", updErr)
    return { error: "Nepodařilo se označit konverzace jako přečtené" }
  }

  revalidatePath("/app/emaily")
  return { success: true, count }
}
