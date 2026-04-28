import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Resolve internal user (public.users) for the currently authenticated auth user.
 *
 * Lookup chain:
 *   1) admin.users WHERE auth_user_id = auth.uid()
 *   2) fallback: admin.users WHERE lower(email) = lower(auth_email)
 *      → if found, self-heal: update auth_user_id to current auth.uid()
 *
 * Returns null if no row matches by either auth_user_id or email.
 *
 * Why fallback: účty zaregistrované mimo `createUser()` (manuálně přes Supabase
 * dashboard, znovu vytvořené auth.users) mají v public.users uložen starý
 * auth_user_id, který už neexistuje. Bez fallbacku všechny server actions
 * volající resolve* selhávaly s "Interní uživatel nenalezen".
 */
export async function resolveInternalUser(
  authUserId: string,
  authEmail: string | null | undefined,
  client?: SupabaseClient,
): Promise<{ id: string; role: string; email: string | null } | null> {
  const admin = client ?? createAdminClient()

  const { data: primary, error: primaryErr } = await admin
    .from("users")
    .select("id, role, email")
    .eq("auth_user_id", authUserId)
    .maybeSingle()

  if (primary) {
    return primary as { id: string; role: string; email: string | null }
  }

  if (!authEmail) {
    console.error("[resolveInternalUser] no row by auth_user_id, no email available", {
      authUserId,
      primaryErr: primaryErr?.message,
    })
    return null
  }

  const normalizedEmail = authEmail.trim().toLowerCase()

  // 1) Exact (case-insensitive) match
  const { data: byEmail, error: emailErr } = await admin
    .from("users")
    .select("id, role, email")
    .ilike("email", normalizedEmail)
    .maybeSingle()

  // 2) Fallback: substring match (pro případ whitespace nebo invisible
  // znaků uvnitř email sloupce v DB). Pokud najdeme přesně 1 match,
  // bereme ho. Více matches → ambiguous, vrátíme null.
  let resolved = byEmail as { id: string; role: string; email: string | null } | null
  if (!resolved) {
    const { data: looseMatches, error: looseErr } = await admin
      .from("users")
      .select("id, role, email")
      .ilike("email", `%${normalizedEmail}%`)
      .limit(2)
    if (looseMatches && looseMatches.length === 1) {
      resolved = looseMatches[0] as { id: string; role: string; email: string | null }
      console.warn("[resolveInternalUser] matched via substring fallback (whitespace?)", {
        authUserId,
        authEmail: normalizedEmail,
        dbEmail: resolved.email,
      })
    } else {
      console.error("[resolveInternalUser] no row by auth_user_id nor email", {
        authUserId,
        authEmail: normalizedEmail,
        primaryErr: primaryErr?.message,
        emailErr: emailErr?.message,
        looseErr: looseErr?.message,
        looseMatchCount: looseMatches?.length ?? 0,
      })
      return null
    }
  }
  // Self-heal: aktualizuj auth_user_id na aktuální auth.uid().
  // Best-effort; pokud selže, vrať záznam i tak (další volání to zkusí znovu).
  const { error: updErr } = await admin
    .from("users")
    .update({ auth_user_id: authUserId })
    .eq("id", resolved.id)

  if (updErr) {
    console.error("[resolveInternalUser] self-heal update failed", {
      authUserId,
      authEmail: normalizedEmail,
      userId: resolved.id,
      updErr: updErr.message,
    })
  }

  return resolved
}

/**
 * Convenience: vrátí jen ID, nebo null.
 */
export async function resolveInternalUserId(
  authUserId: string,
  authEmail: string | null | undefined,
  client?: SupabaseClient,
): Promise<string | null> {
  const u = await resolveInternalUser(authUserId, authEmail, client)
  return u?.id ?? null
}
