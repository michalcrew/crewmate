import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { is2FAEnabled } from "@/lib/2fa/config"
import { isDeviceTrusted } from "@/lib/2fa/trust-cookie"
import { TwoFactorForm } from "./two-factor-form"

export default async function TwoFactorPage() {
  // Bez aktivního 2FA tahle stránka nemá co dělat → redirect.
  if (!is2FAEnabled()) {
    redirect("/app")
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Bez přihlášení → /login (middleware to už redirectne, ale jistota).
  if (!user) {
    redirect("/login")
  }

  // Pokud má uživatel platnou trust cookie → rovnou /app.
  if (await isDeviceTrusted(user.id)) {
    redirect("/app")
  }

  return <TwoFactorForm />
}
