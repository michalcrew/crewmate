"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sanitizeError } from "@/lib/utils/error-sanitizer"

// Rate limit: max RATE_LIMIT_MAX_FAILS selhaných pokusů v posledních
// RATE_LIMIT_WINDOW_MIN minutách → blokace dalších pokusů ve stejném okně.
const RATE_LIMIT_MAX_FAILS = 5
const RATE_LIMIT_WINDOW_MIN = 15

async function getClientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]
    if (first) return first.trim()
  }
  return h.get("x-real-ip")
}

async function isRateLimited(email: string): Promise<boolean> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString()
  const { count, error } = await admin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .ilike("email", email)
    .eq("succeeded", false)
    .gte("created_at", since)

  if (error) {
    // Při chybě DB raději nezablokovat (fail open) — ztráta visibility,
    // ale lepší než zablokovat všechny uživatele kvůli DB problému.
    console.error("[login] rate-limit lookup failed", error)
    return false
  }
  return (count ?? 0) >= RATE_LIMIT_MAX_FAILS
}

async function recordAttempt(email: string, ip: string | null, succeeded: boolean): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("login_attempts").insert({
    email,
    ip_address: ip,
    succeeded,
  })
  if (error) {
    console.error("[login] recordAttempt failed", error)
  }
}

export async function login(formData: FormData) {
  const email = (formData.get("email") as string)?.trim()
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Vyplňte e-mail i heslo." }
  }

  const ip = await getClientIp()

  // Rate limit check před voláním Supabase auth.
  if (await isRateLimited(email)) {
    return {
      error:
        "Příliš mnoho neúspěšných pokusů. Zkuste to znovu za 15 minut nebo si obnovte heslo.",
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // Zalogujeme pokus (úspěšný i nikoliv) — ne-blokující na chybu insertu.
  await recordAttempt(email, ip, !error)

  if (error) {
    // MD-12: neexposovat raw supabase auth error (password patterns, email syntax).
    return { error: sanitizeError(error, "login") }
  }

  redirect("/app")
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
