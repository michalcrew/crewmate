import { createHash, randomInt, timingSafeEqual } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { TWO_FA_CODE_TTL_MIN } from "./config"

// 6místný numerický kód (000000–999999) — leading zeros zachovány.
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

// Hashujeme SHA256. Není to password — jen krátkodobý one-shot kód
// s 10 min platností a TTL na úrovni jednotek pokusů, takže SHA256
// je dostatečné a rychlé. Brute force 6 cifer = 1M kombinací, ale
// kódy expirují za 10 min → pro útočníka mimo dosah.
export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex")
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
}

export async function storeCode(userId: string, code: string): Promise<void> {
  const admin = createAdminClient()
  const expires = new Date(Date.now() + TWO_FA_CODE_TTL_MIN * 60_000).toISOString()
  const { error } = await admin.from("two_factor_codes").insert({
    user_id: userId,
    code_hash: hashCode(code),
    expires_at: expires,
  })
  if (error) throw error
}

// Ověří kód proti nejnovějšímu nepoužitému záznamu pro uživatele.
// Při shodě označí used. Vrací true při úspěchu, false jinak.
export async function verifyAndConsumeCode(userId: string, code: string): Promise<boolean> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("two_factor_codes")
    .select("id, code_hash, expires_at, used_at")
    .eq("user_id", userId)
    .is("used_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return false

  const row = data[0]
  if (!row) return false
  if (!safeEqualHex(row.code_hash, hashCode(code))) return false

  const { error: updErr } = await admin
    .from("two_factor_codes")
    .update({ used_at: now })
    .eq("id", row.id)

  if (updErr) return false
  return true
}
