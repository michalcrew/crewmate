"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/utils/crypto"
import { sendEmail } from "@/lib/email/resend"
import { getOrCreateSmluvniStav, updateDppStav } from "./smluvni-stav"

export async function generateDpp(brigadnikId: string, mesic: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  // Get brigadnik data
  const { data: brigadnik } = await supabase
    .from("brigadnici")
    .select("*")
    .eq("id", brigadnikId)
    .single()

  if (!brigadnik) return { error: "Brigádník nenalezen" }
  if (!brigadnik.dotaznik_vyplnen) return { error: "Brigádník nemá vyplněný dotazník" }

  // Decrypt sensitive fields
  let rodne_cislo = ""
  let cislo_op = ""
  try {
    if (brigadnik.rodne_cislo) rodne_cislo = decrypt(brigadnik.rodne_cislo)
    if (brigadnik.cislo_op) cislo_op = decrypt(brigadnik.cislo_op)
  } catch {
    // Data might not be encrypted (legacy/test data)
    rodne_cislo = brigadnik.rodne_cislo ?? ""
    cislo_op = brigadnik.cislo_op ?? ""
  }

  const mesicLabel = new Date(`${mesic}-01`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })

  // Generate DPP content as HTML (placeholder — real DOCX template will be added later)
  const dppHtml = `
    <html><body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
    <h1 style="text-align: center;">Dohoda o provedení práce</h1>
    <p style="text-align: center;">na měsíc: <strong>${mesicLabel}</strong></p>
    <hr/>
    <h3>Zaměstnavatel:</h3>
    <p>Crewmate, s.r.o.<br/>IČO: 23782587</p>
    <h3>Zaměstnanec:</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Jméno a příjmení</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${brigadnik.jmeno} ${brigadnik.prijmeni}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Rodné číslo</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${rodne_cislo}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Datum narození</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${brigadnik.datum_narozeni ?? ""}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Trvalé bydliště</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${brigadnik.adresa ?? ""}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Číslo OP</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${cislo_op}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Zdravotní pojišťovna</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${brigadnik.zdravotni_pojistovna ?? ""}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Číslo účtu</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${brigadnik.cislo_uctu ?? ""}/${brigadnik.kod_banky ?? ""}</td></tr>
    </table>
    <br/>
    <p><em>Toto je placeholder DPP. Po dodání DOCX šablony bude generováno z reálné šablony.</em></p>
    <br/><br/>
    <table style="width: 100%;"><tr>
      <td style="text-align: center; padding-top: 40px; border-top: 1px solid #000; width: 45%;">Zaměstnavatel</td>
      <td style="width: 10%;"></td>
      <td style="text-align: center; padding-top: 40px; border-top: 1px solid #000; width: 45%;">Zaměstnanec</td>
    </tr></table>
    </body></html>
  `

  // Store as document in Supabase Storage
  const adminClient = createAdminClient()
  const fileName = `DPP_${brigadnik.prijmeni}_${brigadnik.jmeno}_${mesic}.html`
  const storagePath = `dokumenty/${brigadnikId}/dpp/${fileName}`

  const { error: uploadError } = await adminClient.storage
    .from("crewmate-storage")
    .upload(storagePath, new Blob([dppHtml], { type: "text/html" }), { upsert: true })

  // If bucket doesn't exist yet, create it
  if (uploadError?.message?.includes("not found")) {
    await adminClient.storage.createBucket("crewmate-storage", { public: false })
    await adminClient.storage
      .from("crewmate-storage")
      .upload(storagePath, new Blob([dppHtml], { type: "text/html" }), { upsert: true })
  }

  // Create document record
  const { data: dokument } = await adminClient
    .from("dokumenty")
    .insert({
      brigadnik_id: brigadnikId,
      typ: "dpp",
      nazev: fileName,
      storage_path: storagePath,
      mesic: `${mesic}-01`,
      mime_type: "text/html",
    })
    .select("id")
    .single()

  // Update smluvni stav
  const smluvniStav = await getOrCreateSmluvniStav(brigadnikId, mesic)
  await updateDppStav(smluvniStav.id, brigadnikId, "vygenerovano", dokument?.id)

  // Audit log
  const { data: internalUser } = await adminClient
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  await adminClient.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: internalUser?.id,
    typ: "dpp_vygenerovano",
    popis: `DPP vygenerováno pro ${mesicLabel}`,
  })

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return { success: true }
}

export async function sendDppEmail(brigadnikId: string, mesic: string) {
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

  const mesicLabel = new Date(`${mesic}-01`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })

  // Get email template
  const { data: template } = await adminClient
    .from("email_sablony")
    .select("predmet, obsah_html")
    .eq("typ", "dpp")
    .eq("aktivni", true)
    .single()

  const subject = (template?.predmet ?? "DPP k podpisu — {{mesic}} — Crewmate")
    .replace("{{jmeno}}", brigadnik.jmeno)
    .replace("{{mesic}}", mesicLabel)
  const html = (template?.obsah_html ?? `<p>Ahoj ${brigadnik.jmeno}, v příloze DPP na ${mesicLabel}.</p>`)
    .replace("{{jmeno}}", brigadnik.jmeno)
    .replace("{{mesic}}", mesicLabel)

  try {
    await sendEmail({ to: brigadnik.email, subject, html })
  } catch {
    return { error: "Nepodařilo se odeslat email" }
  }

  // Update smluvni stav
  const smluvniStav = await getOrCreateSmluvniStav(brigadnikId, mesic)
  await updateDppStav(smluvniStav.id, brigadnikId, "odeslano")

  // Audit log
  await adminClient.from("historie").insert({
    brigadnik_id: brigadnikId,
    typ: "email_odeslan",
    popis: `DPP odeslána emailem na ${brigadnik.email} (${mesicLabel})`,
  })

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return { success: true }
}

export async function uploadPodpis(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const brigadnikId = formData.get("brigadnik_id") as string
  const mesic = formData.get("mesic") as string
  const typ = formData.get("typ") as string // 'dpp_podpis' | 'prohlaseni_podpis'
  const file = formData.get("file") as File

  if (!file || file.size === 0) return { error: "Soubor je povinný" }
  if (file.size > 20 * 1024 * 1024) return { error: "Soubor je příliš velký (max 20 MB)" }

  const { data: brigadnik } = await supabase
    .from("brigadnici")
    .select("prijmeni, jmeno")
    .eq("id", brigadnikId)
    .single()

  if (!brigadnik) return { error: "Brigádník nenalezen" }

  const adminClient = createAdminClient()
  const ext = file.name.split(".").pop() ?? "pdf"
  const typLabel = typ === "dpp_podpis" ? "DPP_podpis" : "Prohlaseni_podpis"
  const fileName = `${typLabel}_${brigadnik.prijmeni}_${brigadnik.jmeno}_${mesic}.${ext}`
  const storagePath = `dokumenty/${brigadnikId}/${typ}/${fileName}`

  const buffer = Buffer.from(await file.arrayBuffer())
  await adminClient.storage.from("crewmate-storage").upload(storagePath, buffer, {
    contentType: file.type,
    upsert: true,
  })

  // Create document record
  const { data: dokument } = await adminClient
    .from("dokumenty")
    .insert({
      brigadnik_id: brigadnikId,
      typ,
      nazev: fileName,
      storage_path: storagePath,
      mesic: `${mesic}-01`,
      velikost: file.size,
      mime_type: file.type,
    })
    .select("id")
    .single()

  // Update smluvni stav
  const smluvniStav = await getOrCreateSmluvniStav(brigadnikId, mesic)
  if (typ === "dpp_podpis") {
    await updateDppStav(smluvniStav.id, brigadnikId, "podepsano", dokument?.id)
  } else {
    const { updateProhlaseniStav } = await import("./smluvni-stav")
    await updateProhlaseniStav(smluvniStav.id, brigadnikId, "podepsano", dokument?.id)
  }

  // Audit log
  await adminClient.from("historie").insert({
    brigadnik_id: brigadnikId,
    typ: "dokument_nahran",
    popis: `Podepsaný ${typ === "dpp_podpis" ? "DPP" : "prohlášení"} nahrán`,
  })

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return { success: true }
}
