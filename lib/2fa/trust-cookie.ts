import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import {
  TWO_FA_SESSION_COOKIE,
  TWO_FA_TRUST_COOKIE,
  TWO_FA_TRUST_DAYS,
} from "./config"

// Trust cookie hodnota: `${userId}.${expiresAtUnix}.${hmac}`.
// HMAC podepisuje "userId.expiresAt" pomocí TWO_FA_SECRET. Cookie se
// nastavuje s HttpOnly, Secure, SameSite=Lax a maxAge dle TTL.
//
// Session cookie ("2fa_session") má stejný formát, ale bez maxAge —
// platí jen po dobu života browser session.
//
// Bez TWO_FA_SECRET v prostředí trust mechanismus selže fail-closed
// (nikdo není trusted) — pak se 2FA vyžaduje při každém přihlášení.

function getSecret(): string | null {
  return process.env.TWO_FA_SECRET || null
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex")
}

function buildToken(userId: string, expiresAtMs: number, secret: string): string {
  const payload = `${userId}.${expiresAtMs}`
  return `${payload}.${sign(payload, secret)}`
}

// Pure function — neuspustí cookies(), takže ji lze volat z middleware
// (které dostává cookie value přes request.cookies, ne přes next/headers).
export function verifyTrustToken(token: string | undefined, expectedUserId: string): boolean {
  if (!token) return false
  const secret = getSecret()
  if (!secret) return false

  const parts = token.split(".")
  if (parts.length !== 3) return false
  const [userId, expStr, hmac] = parts
  if (!userId || !expStr || !hmac) return false
  if (userId !== expectedUserId) return false

  const expMs = Number(expStr)
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false

  const expected = sign(`${userId}.${expMs}`, secret)
  if (expected.length !== hmac.length) return false

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hmac, "hex"))
  } catch {
    return false
  }
}

export async function setTrustCookie(userId: string, persistDays: number): Promise<void> {
  const secret = getSecret()
  if (!secret) return

  const expiresMs = Date.now() + persistDays * 24 * 60 * 60 * 1000
  const token = buildToken(userId, expiresMs, secret)
  const c = await cookies()
  c.set(TWO_FA_TRUST_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: persistDays * 24 * 60 * 60,
  })
}

// Session cookie — bez maxAge → platí jen do zavření browseru.
// Použití: uživatel projde 2FA, ale nezaškrtne důvěru zařízení.
// Ve stejné session ho 2FA krok nebude obtěžovat, ale po zavření
// browseru musí znovu.
export async function setSessionCookie(userId: string): Promise<void> {
  const secret = getSecret()
  if (!secret) return

  // Session cookie expirace nastavíme na 24 h, i kdyby browser zůstal
  // otevřený dlouho — bezpečnostní strop.
  const expiresMs = Date.now() + 24 * 60 * 60 * 1000
  const token = buildToken(userId, expiresMs, secret)
  const c = await cookies()
  c.set(TWO_FA_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    // bez maxAge → session cookie
  })
}

export async function isDeviceTrusted(userId: string): Promise<boolean> {
  const c = await cookies()
  if (verifyTrustToken(c.get(TWO_FA_TRUST_COOKIE)?.value, userId)) return true
  if (verifyTrustToken(c.get(TWO_FA_SESSION_COOKIE)?.value, userId)) return true
  return false
}

export async function clearAll2FACookies(): Promise<void> {
  const c = await cookies()
  c.delete(TWO_FA_TRUST_COOKIE)
  c.delete(TWO_FA_SESSION_COOKIE)
}

export const TRUST_DAYS_PERSISTENT = TWO_FA_TRUST_DAYS
