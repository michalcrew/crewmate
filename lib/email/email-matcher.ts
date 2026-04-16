import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Match an email address to a brigadník.
 * Returns brigadnik_id or null if no match found.
 */
export async function matchEmailToBrigadnik(
  email: string
): Promise<string | null> {
  const supabase = createAdminClient()
  const normalizedEmail = email.trim().toLowerCase()

  const { data, error } = await supabase
    .from("brigadnici")
    .select("id")
    .ilike("email", normalizedEmail)
    .order("created_at", { ascending: true })
    .limit(1)

  if (error) {
    console.error("Email matcher error:", error)
    return null
  }

  if (!data || data.length === 0) {
    return null
  }

  return data[0]?.id ?? null
}
