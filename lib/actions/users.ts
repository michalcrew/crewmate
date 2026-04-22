"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"
import { sanitizePodpis } from "@/lib/utils/podpis-sanitize"
import { sanitizeError } from "@/lib/utils/error-sanitizer"
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

  if (data?.role) return data.role

  // MD-1 fallback: pokud RLS SELECT vrátí null (edge case se stale session
  // cookies nebo race při auth rehydrataci), role by byla null a admin by
  // byl mylně považován za non-admin. Admin client fallback pattern z
  // getUsers() + updateUserPodpis() — auth check proběhl výš (user != null),
  // takže je bezpečné použít service role pro self-lookup podle auth_user_id.
  const admin = createAdminClient()
  const { data: fallback } = await admin
    .from("users")
    .select("role")
    .eq("auth_user_id", user.id)
    .single()

  return (fallback as { role?: string } | null)?.role ?? null
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

  if (authError) return { error: sanitizeError(authError, "createUser.auth") }
  if (!authUser.user) return { error: "Nepodařilo se vytvořit účet" }

  // Create public.users record
  const { error: insertError } = await adminClient.from("users").insert({
    auth_user_id: authUser.user.id,
    email: parsed.data.email,
    jmeno: parsed.data.jmeno,
    prijmeni: parsed.data.prijmeni,
    role: parsed.data.role,
  })

  if (insertError) return { error: sanitizeError(insertError, "createUser.insert") }

  revalidatePath("/app/nastaveni")
  return { success: true }
}

/**
 * F-0013 US-1E-1 + ADR-1E: Updatuje `users.podpis` pro aktuálně
 * přihlášeného uživatele. Sanitizace přes `sanitize-html` allowlist,
 * max 1000 znaků (Zod). Audit log pokud sanitizace něco stripla (XSS attempt).
 */
export async function updateUserPodpis(
  podpis: string,
  pridatLogo: boolean = false
): Promise<{ success: true; stripped?: number } | { error: string }> {
  const parsed = updateUserPodpisSchema.safeParse({ podpis, pridat_logo: pridatLogo })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatný podpis" }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const sanitized = sanitizePodpis(parsed.data.podpis)

  // HF4c: RLS lookup fallback — pattern z getUsers().
  // Auth check už proběhl výše (user != null), takže je bezpečné
  // použít admin client pokud RLS SELECT vrátí prázdno. Filter
  // auth_user_id = user.id zajistí self-only write.
  const admin = createAdminClient()
  const { data: internalUser } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  if (!internalUser) return { error: "Uživatel nenalezen" }

  const { error } = await admin
    .from("users")
    .update({
      podpis: sanitized.sanitized,
      pridat_logo: parsed.data.pridat_logo,
    })
    .eq("id", internalUser.id)

  if (error) return { error: sanitizeError(error, "updateUserPodpis") }

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
  const { prependCrewmateLogo } = await import("@/lib/utils/email-signature")

  const admin = createAdminClient()
  const { data } = await admin
    .from("users")
    .select("jmeno, prijmeni, podpis, pridat_logo")
    .eq("id", userId)
    .single()

  if (!data) return "Tým Crewmate"

  const podpis = (data.podpis ?? "").trim()
  const base =
    podpis.length > 0 ? podpis : `${data.jmeno} ${data.prijmeni}, tým Crewmate`

  return (data as { pridat_logo?: boolean }).pridat_logo
    ? prependCrewmateLogo(base)
    : base
}

// ================================================================
// F-0019 — Sazby (hodinové) per user
// ================================================================

const sazbaSchema = z
  .union([z.number(), z.null()])
  .refine(
    (v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 9999.99),
    "Sazba musí být mezi 0 a 9999,99 Kč/hod (nebo prázdná)",
  )

/**
 * F-0019 — Admin-only update hodinové sazby náborářky.
 * Audit `sazba_zmenena` s before/after v metadata (sazba v auditu smí být,
 * mimo audit log se nikdy neloguje čitelně — secret handling rule).
 */
export async function updateUserSazba(
  userId: string,
  sazba: number | null,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const role = await getCurrentUserRole()
  if (role !== "admin") return { error: "Nemáte oprávnění (jen admin)" }

  if (!userId) return { error: "Chybí ID uživatele" }
  const parsed = sazbaSchema.safeParse(sazba)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná sazba" }
  }

  const admin = createAdminClient()

  // Before snapshot pro audit
  const { data: before } = await admin
    .from("users")
    .select("id, sazba_kc_hod, jmeno, prijmeni")
    .eq("id", userId)
    .single()

  if (!before) return { error: "Uživatel nenalezen" }

  const { error } = await admin
    .from("users")
    .update({ sazba_kc_hod: parsed.data })
    .eq("id", userId)

  if (error) return { error: sanitizeError(error, "updateUserSazba") }

  // Actor = internal user id
  const { data: actor } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  await admin.from("historie").insert({
    user_id: userId, // afected
    typ: "sazba_zmenena",
    popis: `Hodinová sazba změněna (${(before as { jmeno: string }).jmeno} ${(before as { prijmeni: string }).prijmeni})`,
    metadata: {
      user_id_affected: userId,
      actor_user_id: (actor as { id?: string } | null)?.id ?? null,
      old_sazba: (before as { sazba_kc_hod: number | null }).sazba_kc_hod,
      new_sazba: parsed.data,
    },
  })

  revalidatePath("/app/nastaveni")
  revalidatePath("/app/hodiny")
  revalidatePath("/app/hodiny/prehled")
  return { success: true }
}

/**
 * F-0019 — Načte hodinovou sazbu. Self (kdokoli) NEBO admin (libovolný user).
 * Non-admin caller s cizím userId → error (privacy guard per D-F0019-09).
 */
export async function getUserSazba(
  userId?: string,
): Promise<{ sazba_kc_hod: number | null } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const admin = createAdminClient()
  const { data: me } = await admin
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single()

  if (!me) return { error: "Profil nenalezen" }

  const meId = (me as { id: string }).id
  const meRole = (me as { role: string }).role
  const targetId = userId ?? meId

  if (targetId !== meId && meRole !== "admin") {
    return { error: "Nemáte oprávnění" }
  }

  const { data } = await admin
    .from("users")
    .select("sazba_kc_hod")
    .eq("id", targetId)
    .single()

  if (!data) return { error: "Uživatel nenalezen" }
  return { sazba_kc_hod: (data as { sazba_kc_hod: number | null }).sazba_kc_hod }
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

  if (error) return { error: sanitizeError(error, "toggleUserActive") }

  revalidatePath("/app/nastaveni")
  return { success: true }
}
