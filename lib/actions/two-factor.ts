"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { generateCode, storeCode, verifyAndConsumeCode } from "@/lib/2fa/codes"
import { sendTwoFactorEmail } from "@/lib/2fa/email"
import {
  setSessionCookie,
  setTrustCookie,
  clearAll2FACookies,
  TRUST_DAYS_PERSISTENT,
} from "@/lib/2fa/trust-cookie"
import { is2FAEnabled } from "@/lib/2fa/config"

// Pošle nový kód aktuálně přihlášenému uživateli (resend tlačítko).
export async function requestNew2FACode(): Promise<{ ok: boolean; error?: string }> {
  if (!is2FAEnabled()) return { ok: false, error: "2FA není aktivní." }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) return { ok: false, error: "Nejprve se přihlaste." }

  try {
    const code = generateCode()
    await storeCode(user.id, code)
    await sendTwoFactorEmail(user.email, code)
    return { ok: true }
  } catch (e) {
    console.error("[requestNew2FACode] failed", e)
    return { ok: false, error: "Nepodařilo se odeslat kód, zkuste znovu." }
  }
}

// Ověří kód a buď nastaví trust cookie a přesměruje do /app, nebo vrátí chybu.
export async function verify2FA(formData: FormData): Promise<{ error: string } | void> {
  if (!is2FAEnabled()) redirect("/app")

  const code = (formData.get("code") as string)?.trim()
  const trustDevice = formData.get("trustDevice") === "on"

  if (!code || !/^\d{6}$/.test(code)) {
    return { error: "Zadejte 6místný kód." }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Vypršela přihlašovací relace, přihlaste se znovu." }

  const ok = await verifyAndConsumeCode(user.id, code)
  if (!ok) return { error: "Kód není správný nebo vypršel. Vyžádejte si nový." }

  if (trustDevice) {
    await setTrustCookie(user.id, TRUST_DAYS_PERSISTENT)
  } else {
    await setSessionCookie(user.id)
  }

  redirect("/app")
}

// Volá se z logout — vyčistí trust cookies, aby přihlášení na sdíleném
// zařízení po odhlášení vyžadovalo nové 2FA.
export async function clear2FATrust(): Promise<void> {
  await clearAll2FACookies()
}
