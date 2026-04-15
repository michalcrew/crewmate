"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail } from "@/lib/email/resend"
import { encrypt } from "@/lib/utils/crypto"
import { z } from "zod"

const dotaznikSchema = z.object({
  token: z.string(),
  jmeno: z.string().min(1),
  prijmeni: z.string().min(1),
  rodne_cislo: z.string().min(1, "Rodné číslo je povinné"),
  rodne_jmeno: z.string().optional(),
  rodne_prijmeni: z.string().optional(),
  datum_narozeni: z.string().min(1, "Datum narození je povinné"),
  misto_narozeni: z.string().min(1, "Místo narození je povinné"),
  adresa: z.string().min(1, "Adresa je povinná"),
  korespondencni_adresa: z.string().optional(),
  cislo_op: z.string().min(1, "Číslo OP je povinné"),
  zdravotni_pojistovna: z.string().min(1, "Zdravotní pojišťovna je povinná"),
  cislo_uctu: z.string().min(1, "Číslo účtu je povinné"),
  kod_banky: z.string().min(1, "Kód banky je povinný"),
  vzdelani: z.string().min(1, "Vzdělání je povinné"),
  student: z.string().optional(),
  nazev_skoly: z.string().optional(),
  uplatnuje_slevu_jinde: z.string().optional(),
  gdpr: z.literal("on", { message: "Souhlas je povinný" }),
})

export async function getFormularByToken(token: string) {
  const supabase = createAdminClient()

  const { data: tokenData } = await supabase
    .from("formular_tokeny")
    .select("*, brigadnik:brigadnici(id, jmeno, prijmeni, email, telefon)")
    .eq("token", token)
    .eq("vyplneno", false)
    .single()

  if (!tokenData) return null

  // Check expiration
  if (new Date(tokenData.expiruje_at) < new Date()) return null

  return tokenData
}

export async function submitDotaznik(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  const parsed = dotaznikSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const supabase = createAdminClient()

  // Verify token
  const { data: tokenData } = await supabase
    .from("formular_tokeny")
    .select("brigadnik_id")
    .eq("token", parsed.data.token)
    .eq("vyplneno", false)
    .single()

  if (!tokenData) return { error: "Neplatný nebo expirovaný odkaz" }

  // Encrypt sensitive fields
  const encryptedRC = encrypt(parsed.data.rodne_cislo)
  const encryptedOP = encrypt(parsed.data.cislo_op)

  // Update brigadnik with personal data
  const { error: updateError } = await supabase
    .from("brigadnici")
    .update({
      jmeno: parsed.data.jmeno,
      prijmeni: parsed.data.prijmeni,
      rodne_cislo: encryptedRC,
      rodne_jmeno: parsed.data.rodne_jmeno || null,
      rodne_prijmeni: parsed.data.rodne_prijmeni || null,
      datum_narozeni: parsed.data.datum_narozeni,
      misto_narozeni: parsed.data.misto_narozeni,
      adresa: parsed.data.adresa,
      korespondencni_adresa: parsed.data.korespondencni_adresa || null,
      cislo_op: encryptedOP,
      zdravotni_pojistovna: parsed.data.zdravotni_pojistovna,
      cislo_uctu: parsed.data.cislo_uctu,
      kod_banky: parsed.data.kod_banky,
      vzdelani: parsed.data.vzdelani,
      student: parsed.data.student === "on",
      nazev_skoly: parsed.data.nazev_skoly || null,
      uplatnuje_slevu_jinde: parsed.data.uplatnuje_slevu_jinde === "on",
      dotaznik_vyplnen: true,
      dotaznik_vyplnen_at: new Date().toISOString(),
      gdpr_souhlas: true,
      gdpr_souhlas_at: new Date().toISOString(),
    })
    .eq("id", tokenData.brigadnik_id)

  if (updateError) return { error: "Nepodařilo se uložit údaje" }

  // Mark token as used
  await supabase
    .from("formular_tokeny")
    .update({ vyplneno: true, vyplneno_at: new Date().toISOString() })
    .eq("token", parsed.data.token)

  // Auto-update pipeline: move to prijaty_nehotova_admin
  await supabase
    .from("pipeline_entries")
    .update({ stav: "prijaty_nehotova_admin" })
    .eq("brigadnik_id", tokenData.brigadnik_id)
    .in("stav", ["zajemce", "kontaktovan"])

  // Audit log
  await supabase.from("historie").insert({
    brigadnik_id: tokenData.brigadnik_id,
    typ: "dotaznik_vyplnen",
    popis: "Dotazník osobních údajů vyplněn",
  })

  return { success: true }
}

export async function sendDotaznikEmail(brigadnikId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const adminClient = createAdminClient()

  // Get brigadnik
  const { data: brigadnik } = await adminClient
    .from("brigadnici")
    .select("id, jmeno, prijmeni, email")
    .eq("id", brigadnikId)
    .single()

  if (!brigadnik) return { error: "Brigádník nenalezen" }

  // Create token
  const { data: token, error: tokenError } = await adminClient
    .from("formular_tokeny")
    .insert({ brigadnik_id: brigadnikId, typ: "dotaznik" })
    .select("token")
    .single()

  if (tokenError || !token) return { error: "Nepodařilo se vytvořit odkaz" }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const link = `${appUrl}/formular/${token.token}`

  // Get email template
  const { data: template } = await adminClient
    .from("email_sablony")
    .select("predmet, obsah_html")
    .eq("typ", "dotaznik")
    .eq("aktivni", true)
    .single()

  const subject = (template?.predmet ?? "Doplnění údajů — Crewmate")
    .replace("{{jmeno}}", brigadnik.jmeno)
  const html = (template?.obsah_html ?? `<p>Ahoj ${brigadnik.jmeno},</p><p><a href="${link}">Doplnit údaje</a></p>`)
    .replace("{{jmeno}}", brigadnik.jmeno)
    .replace("{{prijmeni}}", brigadnik.prijmeni)
    .replace("{{odkaz_formular}}", link)

  try {
    await sendEmail({ to: brigadnik.email, subject, html })
  } catch {
    return { error: "Nepodařilo se odeslat email" }
  }

  // Audit log
  const { data: internalUser } = await adminClient
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  await adminClient.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: internalUser?.id,
    typ: "email_odeslan",
    popis: `Dotazník odeslán na ${brigadnik.email}`,
  })

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return { success: true }
}
