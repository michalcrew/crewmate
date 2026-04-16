"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/utils/crypto"
import { escapeHtml, isAllowedFileType, MAX_FILE_SIZE } from "@/lib/utils/sanitize"
import { sendGmailMessage } from "@/lib/email/gmail-send"
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

  // Escape all user data for HTML
  const fullAdresa = brigadnik.adresa
    ?? [brigadnik.ulice_cp, brigadnik.psc, brigadnik.mesto_bydliste, brigadnik.zeme].filter(Boolean).join(", ")

  const safe = {
    jmeno: escapeHtml(brigadnik.jmeno),
    prijmeni: escapeHtml(brigadnik.prijmeni),
    rodne_cislo: escapeHtml(rodne_cislo),
    cislo_op: escapeHtml(cislo_op),
    datum_narozeni: escapeHtml(brigadnik.datum_narozeni ?? ""),
    adresa: escapeHtml(fullAdresa),
    ulice_cp: escapeHtml(brigadnik.ulice_cp ?? ""),
    psc: escapeHtml(brigadnik.psc ?? ""),
    mesto_bydliste: escapeHtml(brigadnik.mesto_bydliste ?? ""),
    zeme: escapeHtml(brigadnik.zeme ?? ""),
    misto_narozeni: escapeHtml(brigadnik.misto_narozeni ?? ""),
    zdravotni_pojistovna: escapeHtml(brigadnik.zdravotni_pojistovna ?? ""),
    cislo_uctu: escapeHtml(brigadnik.cislo_uctu ?? ""),
    kod_banky: escapeHtml(brigadnik.kod_banky ?? ""),
    vzdelani: escapeHtml(brigadnik.vzdelani ?? ""),
    uplatnuje_slevu_text: brigadnik.uplatnuje_slevu_jinde ? "SOUČASNĚ" : "NESOUČASNĚ",
  }

  // Load DPP template from DB
  const adminClient = createAdminClient()
  const { data: sablona } = await adminClient
    .from("dokument_sablony")
    .select("obsah_html")
    .eq("typ", "dpp")
    .eq("aktivni", true)
    .lte("platnost_od", `${mesic}-01`)
    .order("platnost_od", { ascending: false })
    .limit(1)
    .single()

  // Generate DPP from template (or fallback)
  const dppTemplate = sablona?.obsah_html ?? `
    <html><body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
    <h1 style="text-align: center;">Dohoda o provedení práce</h1>
    <p style="text-align: center;">na měsíc: <strong>${mesicLabel}</strong></p>
    <hr/>
    <h3>Zaměstnavatel:</h3>
    <p>Crewmate, s.r.o.<br/>IČO: 23782587</p>
    <h3>Zaměstnanec:</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Jméno a příjmení</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${safe.jmeno} ${safe.prijmeni}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Rodné číslo</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${safe.rodne_cislo}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Datum narození</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${safe.datum_narozeni}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Trvalé bydliště</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${safe.adresa}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Číslo OP</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${safe.cislo_op}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Zdravotní pojišťovna</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${safe.zdravotni_pojistovna}</td></tr>
      <tr><td style="padding: 4px 8px; border: 1px solid #ccc;">Číslo účtu</td><td style="padding: 4px 8px; border: 1px solid #ccc;">${safe.cislo_uctu}/${safe.kod_banky}</td></tr>
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

  // Replace template variables with escaped user data
  const dppHtml = dppTemplate
    .replaceAll("{{jmeno}}", safe.jmeno)
    .replaceAll("{{prijmeni}}", safe.prijmeni)
    .replaceAll("{{rodne_cislo}}", safe.rodne_cislo)
    .replaceAll("{{datum_narozeni}}", safe.datum_narozeni)
    .replaceAll("{{adresa}}", safe.adresa)
    .replaceAll("{{ulice_cp}}", safe.ulice_cp)
    .replaceAll("{{psc}}", safe.psc)
    .replaceAll("{{mesto_bydliste}}", safe.mesto_bydliste)
    .replaceAll("{{zeme}}", safe.zeme)
    .replaceAll("{{misto_narozeni}}", safe.misto_narozeni)
    .replaceAll("{{cislo_op}}", safe.cislo_op)
    .replaceAll("{{zdravotni_pojistovna}}", safe.zdravotni_pojistovna)
    .replaceAll("{{cislo_uctu}}", safe.cislo_uctu)
    .replaceAll("{{kod_banky}}", safe.kod_banky)
    .replaceAll("{{vzdelani}}", safe.vzdelani)
    .replaceAll("{{mesic}}", escapeHtml(mesicLabel))
    .replaceAll("{{uplatnuje_slevu_text}}", safe.uplatnuje_slevu_text)

  // Store as document in Supabase Storage
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

export async function generateProhlaseni(brigadnikId: string, mesic: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { data: brigadnik } = await supabase
    .from("brigadnici").select("*").eq("id", brigadnikId).single()
  if (!brigadnik) return { error: "Brigádník nenalezen" }
  if (!brigadnik.dotaznik_vyplnen) return { error: "Brigádník nemá vyplněný dotazník" }

  let rodne_cislo = ""
  try { if (brigadnik.rodne_cislo) rodne_cislo = decrypt(brigadnik.rodne_cislo) } catch { rodne_cislo = brigadnik.rodne_cislo ?? "" }

  const mesicLabel = new Date(`${mesic}-01`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })
  const adminClient = createAdminClient()

  const safe = {
    jmeno: escapeHtml(brigadnik.jmeno), prijmeni: escapeHtml(brigadnik.prijmeni),
    rodne_cislo: escapeHtml(rodne_cislo), adresa: escapeHtml(brigadnik.adresa ?? ""),
    uplatnuje_slevu_text: brigadnik.uplatnuje_slevu_jinde ? "SOUČASNĚ" : "NESOUČASNĚ",
  }

  const { data: sablona } = await adminClient
    .from("dokument_sablony").select("obsah_html").eq("typ", "prohlaseni").eq("aktivni", true)
    .lte("platnost_od", `${mesic}-01`).order("platnost_od", { ascending: false }).limit(1).single()

  const html = (sablona?.obsah_html ?? "<p>Prohlášení — šablona nenalezena</p>")
    .replaceAll("{{jmeno}}", safe.jmeno).replaceAll("{{prijmeni}}", safe.prijmeni)
    .replaceAll("{{rodne_cislo}}", safe.rodne_cislo).replaceAll("{{adresa}}", safe.adresa)
    .replaceAll("{{mesic}}", escapeHtml(mesicLabel))
    .replaceAll("{{uplatnuje_slevu_text}}", safe.uplatnuje_slevu_text)

  const fileName = `Prohlaseni_${brigadnik.prijmeni}_${brigadnik.jmeno}_${mesic}.html`
  const storagePath = `dokumenty/${brigadnikId}/prohlaseni/${fileName}`

  await adminClient.storage.from("crewmate-storage").upload(storagePath, new Blob([html], { type: "text/html" }), { upsert: true })

  const { data: dokument } = await adminClient.from("dokumenty").insert({
    brigadnik_id: brigadnikId, typ: "prohlaseni", nazev: fileName,
    storage_path: storagePath, mesic: `${mesic}-01`, mime_type: "text/html",
  }).select("id").single()

  const smluvniStav = await getOrCreateSmluvniStav(brigadnikId, mesic)
  const { updateProhlaseniStav } = await import("./smluvni-stav")
  await updateProhlaseniStav(smluvniStav.id, brigadnikId, "vygenerovano", dokument?.id)

  const { data: internalUser } = await adminClient.from("users").select("id").eq("auth_user_id", user.id).single()
  await adminClient.from("historie").insert({
    brigadnik_id: brigadnikId, user_id: internalUser?.id,
    typ: "dpp_vygenerovano", popis: `Prohlášení vygenerováno pro ${mesicLabel}`,
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
    .select("*")
    .eq("id", brigadnikId)
    .single()

  if (!brigadnik) return { error: "Brigádník nenalezen" }
  if (!brigadnik.dotaznik_vyplnen) return { error: "Brigádník nemá vyplněný dotazník — nelze generovat DPP" }

  const mesicLabel = new Date(`${mesic}-01`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })

  // Decrypt sensitive data for PDF
  let rodne_cislo = ""
  let cislo_op = ""
  try { if (brigadnik.rodne_cislo) rodne_cislo = decrypt(brigadnik.rodne_cislo) } catch { rodne_cislo = brigadnik.rodne_cislo ?? "" }
  try { if (brigadnik.cislo_op) cislo_op = decrypt(brigadnik.cislo_op) } catch { cislo_op = brigadnik.cislo_op ?? "" }

  // Generate PDF
  const { generateDppPdf } = await import("@/lib/pdf/generate-dpp-pdf")
  const pdfBuffer = await generateDppPdf({
    jmeno: brigadnik.jmeno,
    prijmeni: brigadnik.prijmeni,
    rodne_cislo,
    datum_narozeni: brigadnik.datum_narozeni ?? "",
    adresa: brigadnik.adresa ?? "",
    cislo_op,
    zdravotni_pojistovna: brigadnik.zdravotni_pojistovna ?? "",
    cislo_uctu: brigadnik.cislo_uctu ?? "",
    kod_banky: brigadnik.kod_banky ?? "",
    mesicLabel,
  })

  const pdfFilename = `DPP_${brigadnik.prijmeni}_${brigadnik.jmeno}_${mesic}.pdf`

  // Email with PDF attachment
  const subject = `DPP k podpisu — ${mesicLabel} — Crewmate`
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Dobrý den, ${escapeHtml(brigadnik.jmeno)},</h2>
      <p>v příloze Vám zasíláme <strong>Dohodu o provedení práce (DPP)</strong> na měsíc <strong>${escapeHtml(mesicLabel)}</strong>.</p>

      <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0;"><strong>Jak postupovat:</strong></p>
        <ol style="margin: 0; padding-left: 20px;">
          <li>Otevřete přílohu <strong>${escapeHtml(pdfFilename)}</strong></li>
          <li>Vytiskněte dokument</li>
          <li>Podepište na vyznačeném místě (zaměstnanec)</li>
          <li>Naskenujte nebo vyfoťte <strong>celý podepsaný dokument</strong></li>
          <li>Pošlete zpět na tento email jako přílohu</li>
        </ol>
      </div>

      <p><strong>Alternativně</strong> můžete dokument podepsat digitálně (elektronický podpis) a zaslat zpět s dnešním datem.</p>

      <p style="color: #666; font-size: 12px; margin-top: 24px;">
        Pokud máte jakékoliv dotazy, neváhejte nás kontaktovat na team@crewmate.cz nebo +420 774 617 955.
      </p>

      <p>Děkujeme,<br/><strong>Tým Crewmate</strong></p>
    </div>
  `

  try {
    await sendGmailMessage({
      to: brigadnik.email,
      subject,
      bodyHtml: html,
      attachments: [{
        filename: pdfFilename,
        content: pdfBuffer,
        mimeType: "application/pdf",
      }],
    })
  } catch (err) {
    console.error("DPP email error:", err)
    return { error: "Nepodařilo se odeslat email" }
  }

  // Update smluvni stav
  const smluvniStav = await getOrCreateSmluvniStav(brigadnikId, mesic)
  await updateDppStav(smluvniStav.id, brigadnikId, "odeslano")

  // Get internal user for audit
  const { data: internalUser } = await adminClient.from("users").select("id").eq("auth_user_id", user.id).single()

  // Audit log
  await adminClient.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: internalUser?.id,
    typ: "email_odeslan",
    popis: `DPP odeslána emailem s PDF přílohou na ${brigadnik.email} (${mesicLabel})`,
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
  if (file.size > MAX_FILE_SIZE) return { error: "Soubor je příliš velký (max 20 MB)" }
  if (!isAllowedFileType(file.type)) return { error: "Nepodporovaný typ souboru. Povolené: PDF, JPG, PNG." }

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
