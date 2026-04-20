"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendGmailMessage } from "@/lib/email/gmail-send"
import { encrypt, maybeEncryptDic } from "@/lib/utils/crypto"
import { dotaznikSchema } from "@/lib/schemas/dotaznik"
import { maybeAutoTransitionPipeline } from "./pipeline"

export async function getFormularByToken(token: string) {
  const supabase = createAdminClient()

  const { data: tokenData } = await supabase
    .from("formular_tokeny")
    .select("*, brigadnik:brigadnici(id, jmeno, prijmeni, email, telefon)")
    .eq("token", token)
    .eq("vyplneno", false)
    .single()

  if (!tokenData) return null

  if (new Date(tokenData.expiruje_at) < new Date()) return null

  return tokenData
}

/**
 * F-0013: submitDotaznik s discriminated union.
 *
 * D-F0013-14: `typ_brigadnika` default = 'brigadnik' pokud FormData neobsahuje
 * (checkbox unchecked = chybějící key → discriminator by selhal).
 *
 * Brigadnik branch:
 *  - plné DPP údaje, šifrované RČ + OP
 *  - `dotaznik_vyplnen=true`, nová pole `narodnost`, `chce_ruzove_prohlaseni`
 *
 * OSVČ branch:
 *  - jen fakturační údaje (osvc_ico, osvc_dic, osvc_fakturacni_adresa)
 *  - `typ_brigadnika='osvc'`
 *  - RČ/OP/banka/pojišťovna se nedotýkají (zůstanou NULL)
 *  - DIČ: mixed-encryption dle D-17 security override přes `maybeEncryptDic()`
 *    (FO = CZ+10 číslic šifrováno, PO = CZ+8–9 číslic plain — veřejný IČO)
 *  - volá maybeAutoTransitionPipeline — OSVČ flag auto-flipne NH→VV
 */
export async function submitDotaznik(formData: FormData) {
  const raw = Object.fromEntries(formData.entries()) as Record<string, string>

  // D-F0013-14: default discriminator
  if (!raw.typ_brigadnika || (raw.typ_brigadnika !== "brigadnik" && raw.typ_brigadnika !== "osvc")) {
    raw.typ_brigadnika = "brigadnik"
  }

  const parsed = dotaznikSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const input = parsed.data
  const supabase = createAdminClient()

  const { data: tokenData } = await supabase
    .from("formular_tokeny")
    .select("brigadnik_id")
    .eq("token", input.token)
    .eq("vyplneno", false)
    .single()

  if (!tokenData) return { error: "Neplatný nebo expirovaný odkaz" }

  const now = new Date().toISOString()
  const brigadnikId = tokenData.brigadnik_id

  if (input.typ_brigadnika === "brigadnik") {
    // --- Brigadnik branch (DPP) ---
    const encryptedRC = encrypt(input.rodne_cislo)
    const encryptedOP = encrypt(input.cislo_op)

    const zpValue = input.zdravotni_pojistovna === "jina"
      ? (input.zdravotni_pojistovna_jina || "jina")
      : input.zdravotni_pojistovna

    const fullAdresa = `${input.ulice_cp}, ${input.psc} ${input.mesto_bydliste}, ${input.zeme}`

    const chceRuzove = input.chce_ruzove_prohlaseni === "on"
      || input.chce_ruzove_prohlaseni === "true"

    const { error: updateError } = await supabase
      .from("brigadnici")
      .update({
        typ_brigadnika: "brigadnik",
        jmeno: input.jmeno,
        prijmeni: input.prijmeni,
        telefon: input.telefon,
        rodne_cislo: encryptedRC,
        rodne_jmeno: input.rodne_jmeno || null,
        rodne_prijmeni: input.rodne_prijmeni || null,
        datum_narozeni: input.datum_narozeni,
        misto_narozeni: input.misto_narozeni,
        adresa: fullAdresa,
        ulice_cp: input.ulice_cp,
        psc: input.psc,
        mesto_bydliste: input.mesto_bydliste,
        zeme: input.zeme,
        korespondencni_adresa: input.korespondencni_adresa || null,
        cislo_op: encryptedOP,
        zdravotni_pojistovna: zpValue,
        cislo_uctu: input.cislo_uctu,
        kod_banky: input.kod_banky,
        vzdelani: input.vzdelani,
        narodnost: input.narodnost,
        chce_ruzove_prohlaseni: chceRuzove,
        dotaznik_vyplnen: true,
        dotaznik_vyplnen_at: now,
        gdpr_souhlas: true,
        gdpr_souhlas_at: now,
      })
      .eq("id", brigadnikId)

    if (updateError) {
      console.error("submitDotaznik (brigadnik) update error:", updateError)
      return { error: "Nepodařilo se uložit údaje" }
    }
  } else {
    // --- OSVČ branch (fakturace) ---
    const { error: updateError } = await supabase
      .from("brigadnici")
      .update({
        typ_brigadnika: "osvc",
        jmeno: input.jmeno,
        prijmeni: input.prijmeni,
        telefon: input.telefon,
        osvc_ico: input.osvc_ico,
        // D-17: FO (CZ+10) encrypted, PO (CZ+8–9) plain. Viz maybeEncryptDic.
        osvc_dic: maybeEncryptDic(input.osvc_dic),
        osvc_fakturacni_adresa: input.osvc_fakturacni_adresa,
        dotaznik_vyplnen: true,
        dotaznik_vyplnen_at: now,
        gdpr_souhlas: true,
        gdpr_souhlas_at: now,
      })
      .eq("id", brigadnikId)

    if (updateError) {
      console.error("submitDotaznik (osvc) update error:", updateError)
      return { error: "Nepodařilo se uložit fakturační údaje" }
    }
  }

  await supabase
    .from("formular_tokeny")
    .update({ vyplneno: true, vyplneno_at: now })
    .eq("token", input.token)

  // Auto pipeline: brigadnik → NH, OSVČ → VV (přes auto-transition)
  await supabase
    .from("pipeline_entries")
    .update({ stav: "prijaty_nehotova_admin" })
    .eq("brigadnik_id", brigadnikId)
    .in("stav", ["zajemce", "kontaktovan"])

  await supabase.from("historie").insert({
    brigadnik_id: brigadnikId,
    typ: "dotaznik_vyplnen",
    popis: input.typ_brigadnika === "osvc"
      ? "Dotazník vyplněn (OSVČ větev)"
      : "Dotazník osobních údajů vyplněn",
    metadata: { typ_brigadnika: input.typ_brigadnika },
  })

  // D-F0013-03: OSVČ flag → auto-flipnout všechny NH entries na VV
  if (input.typ_brigadnika === "osvc") {
    await maybeAutoTransitionPipeline(brigadnikId, "osvc_flag")
  }

  return { success: true, brigadnik_id: brigadnikId }
}

export async function sendDotaznikEmail(brigadnikId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const adminClient = createAdminClient()

  const { data: brigadnik } = await adminClient
    .from("brigadnici")
    .select("id, jmeno, prijmeni, email")
    .eq("id", brigadnikId)
    .single()

  if (!brigadnik) return { error: "Brigádník nenalezen" }

  const { data: token, error: tokenError } = await adminClient
    .from("formular_tokeny")
    .insert({ brigadnik_id: brigadnikId, typ: "dotaznik" })
    .select("token")
    .single()

  if (tokenError || !token) return { error: "Nepodařilo se vytvořit odkaz" }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const link = `${appUrl}/formular/${token.token}`

  const { data: template } = await adminClient
    .from("email_sablony")
    .select("predmet, obsah_html")
    .eq("typ", "dotaznik")
    .eq("aktivni", true)
    .single()

  const subject = (template?.predmet ?? "Doplnění údajů — Crewmate")
    .replaceAll("{{jmeno}}", brigadnik.jmeno)
  const html = (template?.obsah_html ?? `<p>Ahoj ${brigadnik.jmeno},</p><p><a href="${link}">Doplnit údaje</a></p>`)
    .replaceAll("{{jmeno}}", brigadnik.jmeno)
    .replaceAll("{{prijmeni}}", brigadnik.prijmeni)
    .replaceAll("{{odkaz_formular}}", link)

  try {
    await sendGmailMessage({ to: brigadnik.email, subject, bodyHtml: html })
  } catch (err) {
    console.error("Dotazník email error:", err)
    return { error: "Nepodařilo se odeslat email" }
  }

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
