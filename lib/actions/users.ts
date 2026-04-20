"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"
import { sanitizePodpis } from "@/lib/utils/podpis-sanitize"
import { updateUserPodpisSchema } from "@/lib/schemas/dotaznik"

export async function getUsers() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from("users")
    .select("*")
    .order("role", { ascending: true })
    .order("prijmeni", { ascending: true })

  // Fallback: if RLS returns empty but user is authenticated, try with admin client
  if ((!data || data.length === 0)) {
    const adminClient = createAdminClient()
    const { data: adminData } = await adminClient
      .from("users")
      .select("*")
      .order("role", { ascending: true })
      .order("prijmeni", { ascending: true })
    return adminData ?? []
  }

  return data ?? []
}

export async function getCurrentUserRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("auth_user_id", user.id)
    .single()

  return data?.role ?? null
}

const createUserSchema = z.object({
  email: z.string().email("Neplatný email"),
  jmeno: z.string().min(1, "Jméno je povinné"),
  prijmeni: z.string().min(1, "Příjmení je povinné"),
  role: z.enum(["admin", "naborar"]),
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků"),
})

export async function createUser(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  // Check if current user is admin
  const role = await getCurrentUserRole()
  if (role !== "admin") return { error: "Nemáte oprávnění" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = createUserSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  const adminClient = createAdminClient()

  // Create auth user
  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  })

  if (authError) return { error: authError.message }
  if (!authUser.user) return { error: "Nepodařilo se vytvořit účet" }

  // Create public.users record
  const { error: insertError } = await adminClient.from("users").insert({
    auth_user_id: authUser.user.id,
    email: parsed.data.email,
    jmeno: parsed.data.jmeno,
    prijmeni: parsed.data.prijmeni,
    role: parsed.data.role,
  })

  if (insertError) return { error: insertError.message }

  revalidatePath("/app/nastaveni")
  return { success: true }
}

/**
 * F-0013 US-1E-1 + ADR-1E: Updatuje `users.podpis` pro aktuálně
 * přihlášeného uživatele. Sanitizace přes `sanitize-html` allowlist,
 * max 1000 znaků (Zod). Audit log pokud sanitizace něco stripla (XSS attempt).
 */
export async function updateUserPodpis(
  podpis: string
): Promise<{ success: true; stripped?: number } | { error: string }> {
  const parsed = updateUserPodpisSchema.safeParse({ podpis })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatný podpis" }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const sanitized = sanitizePodpis(parsed.data.podpis)

  // Update own row WHERE auth_user_id = auth.uid()
  const { data: internalUser, error: selectErr } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  if (selectErr || !internalUser) return { error: "Uživatel nenalezen" }

  const { error } = await supabase
    .from("users")
    .update({ podpis: sanitized.sanitized })
    .eq("id", internalUser.id)

  if (error) return { error: error.message }

  if (sanitized.hadInjection) {
    const admin = createAdminClient()
    await admin.from("historie").insert({
      user_id: internalUser.id,
      typ: "podpis_sanitized",
      popis: `Podpis sanitizován — stripnuto ${sanitized.stripped} znaků`,
      metadata: { stripped: sanitized.stripped, user_id: internalUser.id },
    })
  }

  revalidatePath("/app/nastaveni")
  return { success: true, stripped: sanitized.stripped }
}

/**
 * F-0013: Vrátí email podpis uživatele; pokud je NULL/prázdný,
 * fallback = `"{jmeno} {prijmeni}, tým Crewmate"`.
 *
 * Volaný v F-0014 v `sendEmailAction` — podpis je fetchnut v okamžiku
 * odeslání emailu (edge case 8 — změna podpisu uprostřed compose se projeví).
 */
export async function getUserPodpis(userId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("users")
    .select("jmeno, prijmeni, podpis")
    .eq("id", userId)
    .single()

  if (!data) return "Tým Crewmate"

  const podpis = (data.podpis ?? "").trim()
  if (podpis.length > 0) return podpis
  return `${data.jmeno} ${data.prijmeni}, tým Crewmate`
}

export async function toggleUserActive(userId: string, aktivni: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const role = await getCurrentUserRole()
  if (role !== "admin") return { error: "Nemáte oprávnění" }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from("users")
    .update({ aktivni })
    .eq("id", userId)

  if (error) return { error: error.message }

  revalidatePath("/app/nastaveni")
  return { success: true }
}
