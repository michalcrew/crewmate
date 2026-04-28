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

  const { data: primary } = await admin
    .from("users")
    .select("id, role, email")
    .eq("auth_user_id", authUserId)
    .maybeSingle()

  if (primary) {
    return primary as { id: string; role: string; email: string | null }
  }

  if (!authEmail) return null

  const normalizedEmail = authEmail.trim().toLowerCase()
  const { data: byEmail } = await admin
    .from("users")
    .select("id, role, email")
    .ilike("email", normalizedEmail)
    .maybeSingle()

  if (!byEmail) return null

  // Self-heal: aktualizuj auth_user_id na aktuální auth.uid().
  // Best-effort; pokud selže, vrať záznam i tak (další volání to zkusí znovu).
  await admin
    .from("users")
    .update({ auth_user_id: authUserId })
    .eq("id", (byEmail as { id: string }).id)

  return byEmail as { id: string; role: string; email: string | null }
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
