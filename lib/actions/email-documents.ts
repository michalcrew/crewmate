"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/utils/crypto"
import { escapeHtml } from "@/lib/utils/sanitize"
import { sendGmailMessage } from "@/lib/email/gmail-send"
import { sendDocumentSchema, classifyAttachmentSchema } from "@/lib/schemas/email"
import { validateDPPFields, validateProhlaseniFields } from "@/lib/documents/dpp-data-validator"
import {
  getOrCreateSmluvniStav,
  updateDppStav,
  updateProhlaseniStav,
  signDpp,
  signProhlaseni,
} from "./smluvni-stav"
import type { SendEmailResult } from "@/types/email"

// ============================================================
// sendDocument — Generate PDF + send via Gmail + track everything
// ============================================================

export async function sendDocumentAction(input: unknown): Promise<SendEmailResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Nepřihlášen" }

  const parsed = sendDocumentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Neplatný vstup" }
  }

  const { brigadnik_id, document_type, rok, body_html } = parsed.data

  // Get brigadník with all fields
  const { data: brigadnik } = await supabase
    .from("brigadnici")
    .select("*")
    .eq("id", brigadnik_id)
    .single()

  if (!brigadnik) return { success: false, error: "Brigádník nenalezen" }
  if (!brigadnik.email) return { success: false, error: "Brigádník nemá vyplněný email" }
  if (brigadnik.typ_brigadnika === "osvc") {
    return { success: false, error: "OSVČ nemají DPP/prohlášení — neposíláme dokumenty" }
  }

  const mesicAnchor = `${rok}-01-01`
  const rokLabel = `rok ${rok}`

  // Validate required fields
  const validation = document_type === "dpp"
    ? validateDPPFields(brigadnik)
    : validateProhlaseniFields(brigadnik)

  if (!validation.valid) {
    return {
      success: false,
      error: `Chybějící údaje: ${validation.missing.join(", ")}`,
      missing_fields: validation.missing,
    }
  }

  // Decrypt sensitive fields for PDF (only in memory, never logged)
  let rodne_cislo = ""
  let cislo_op = ""
  try {
    if (brigadnik.rodne_cislo) rodne_cislo = decrypt(brigadnik.rodne_cislo)
    if (brigadnik.cislo_op) cislo_op = decrypt(brigadnik.cislo_op)
  } catch {
    rodne_cislo = brigadnik.rodne_cislo ?? ""
    cislo_op = brigadnik.cislo_op ?? ""
  }

  // Generate PDF via React PDF
  const { generateDppPdf } = await import("@/lib/pdf/generate-dpp-pdf")
  let pdfBuffer: Buffer

  try {
    pdfBuffer = await generateDppPdf({
      jmeno: brigadnik.jmeno,
      prijmeni: brigadnik.prijmeni,
      rodne_cislo,
      datum_narozeni: brigadnik.datum_narozeni ?? "",
      adresa: brigadnik.adresa ?? [brigadnik.ulice_cp, brigadnik.psc, brigadnik.mesto_bydliste].filter(Boolean).join(", "),
      cislo_op,
      zdravotni_pojistovna: brigadnik.zdravotni_pojistovna ?? "",
      cislo_uctu: brigadnik.cislo_uctu ?? "",
      kod_banky: brigadnik.kod_banky ?? "",
      mesicLabel: rokLabel,
    })
  } catch (err) {
    console.error("PDF generation error:", err)
    return { success: false, error: "Nepodařilo se vygenerovat PDF" }
  }

  const typLabel = document_type === "dpp" ? "DPP" : "Prohlaseni"
  const pdfFilename = `${typLabel}_${brigadnik.prijmeni}_${brigadnik.jmeno}_${rok}.pdf`

  // Upload PDF to Supabase Storage
  const adminClient = createAdminClient()
  const storagePath = `dokumenty/${brigadnik_id}/${document_type}/${pdfFilename}`

  await adminClient.storage
    .from("crewmate-storage")
    .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true })

  // Get current user for signature
  const { data: currentUser } = await supabase
    .from("users")
    .select("id, jmeno, prijmeni")
    .eq("auth_user_id", user.id)
    .single()

  // Append signature to email body
  const signature = `<br><br>--<br>${currentUser?.jmeno ?? ""} ${currentUser?.prijmeni ?? ""}<br>Crewmate`
  const fullHtml = body_html + signature

  const subject = document_type === "dpp"
    ? `DPP k podpisu — ${rokLabel}`
    : `Prohlášení k podpisu — ${rokLabel}`

  try {
    // Send via Gmail API with PDF attachment
    const { messageId, threadId } = await sendGmailMessage({
      to: brigadnik.email,
      subject,
      bodyHtml: fullHtml,
      attachments: [{
        filename: pdfFilename,
        content: pdfBuffer,
        mimeType: "application/pdf",
      }],
    })

    // Upsert email_thread
    const { data: existingThread } = await supabase
      .from("email_threads")
      .select("id, message_count")
      .eq("gmail_thread_id", threadId)
      .single()

    let dbThreadId: string

    if (existingThread) {
      dbThreadId = existingThread.id
      await supabase.from("email_threads").update({
        last_message_at: new Date().toISOString(),
        last_message_preview: subject.slice(0, 100),
        message_count: existingThread.message_count + 1,
        status: "ceka_na_brigadnika",
      }).eq("id", dbThreadId)
    } else {
      const { data: newThread } = await supabase.from("email_threads").insert({
        brigadnik_id,
        gmail_thread_id: threadId,
        subject,
        status: "ceka_na_brigadnika",
        last_message_at: new Date().toISOString(),
        last_message_preview: subject.slice(0, 100),
        message_count: 1,
      }).select("id").single()
      dbThreadId = newThread!.id
    }

    // Insert email_message
    const { data: msg } = await supabase.from("email_messages").insert({
      thread_id: dbThreadId,
      gmail_message_id: messageId,
      direction: "outbound",
      from_email: process.env.GMAIL_USER_EMAIL ?? "team@crewmate.cz",
      from_name: currentUser ? `${currentUser.jmeno} ${currentUser.prijmeni}` : null,
      to_email: brigadnik.email,
      subject,
      body_html: fullHtml,
      body_text: "",
      sent_at: new Date().toISOString(),
      sent_by_user_id: currentUser?.id ?? null,
      document_type,
    }).select("id").single()

    // Insert email_attachment record for the PDF
    await supabase.from("email_attachments").insert({
      message_id: msg!.id,
      filename: pdfFilename,
      mime_type: "application/pdf",
      size_bytes: pdfBuffer.length,
      storage_path: storagePath,
    })

    // Create/update document_record
    await supabase.from("document_records").upsert({
      brigadnik_id,
      mesic: mesicAnchor,
      typ: document_type,
      stav: "odeslano",
      email_message_id: msg!.id,
      storage_path: storagePath,
      odeslano_at: new Date().toISOString(),
    }, { onConflict: "brigadnik_id,mesic,typ" })

    // Update smluvni_stav (per-rok)
    const smluvniStav = await getOrCreateSmluvniStav(brigadnik_id, rok)
    if (document_type === "dpp") {
      await updateDppStav(smluvniStav.id, brigadnik_id, "odeslano")
    } else {
      await updateProhlaseniStav(smluvniStav.id, brigadnik_id, "odeslano")
    }

    // Create dokumenty record (existing system compatibility)
    await adminClient.from("dokumenty").insert({
      brigadnik_id,
      typ: document_type,
      nazev: pdfFilename,
      storage_path: storagePath,
      mesic: mesicAnchor,
      velikost: pdfBuffer.length,
      mime_type: "application/pdf",
      nahral_user_id: currentUser?.id,
    })

    // Audit log
    await supabase.from("historie").insert({
      brigadnik_id,
      user_id: currentUser?.id,
      typ: "dokument_odeslan",
      popis: `${typLabel} odeslán emailem na ${brigadnik.email} (${rokLabel})`,
      metadata: { thread_id: dbThreadId, message_id: msg?.id, document_type, rok },
    })

    revalidatePath("/app/emaily")
    revalidatePath(`/app/brigadnici/${brigadnik_id}`)

    return { success: true, thread_id: dbThreadId, message_id: msg?.id }
  } catch (error) {
    console.error("sendDocument error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Nepodařilo se odeslat dokument" }
  }
}

// ============================================================
// classifyAttachment — Classify received attachment as DPP/prohlášení
// ============================================================

export async function classifyAttachmentAction(input: unknown) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const parsed = classifyAttachmentSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatný vstup" }

  const { attachment_id, classified_as, rok } = parsed.data
  const mesicAnchor = rok ? `${rok}-01-01` : null

  // Get current user
  const { data: currentUser } = await supabase
    .from("users").select("id").eq("auth_user_id", user.id).single()

  // Update attachment classification
  await supabase.from("email_attachments").update({
    classified_as,
    classified_at: new Date().toISOString(),
    classified_by_user_id: currentUser?.id,
  }).eq("id", attachment_id)

  // Get thread → brigadnik_id
  const { data: attachment } = await supabase
    .from("email_attachments")
    .select("message_id, email_messages(thread_id, email_threads(brigadnik_id))")
    .eq("id", attachment_id)
    .single()

  const brigadnik_id = (attachment as unknown as {
    email_messages: { email_threads: { brigadnik_id: string } }
  })?.email_messages?.email_threads?.brigadnik_id

  // Update document_records + smluvni_stav for signed documents (F-0013 per-rok)
  if (brigadnik_id && rok && mesicAnchor && ["dpp_podpis", "prohlaseni_podpis"].includes(classified_as)) {
    const docType = classified_as === "dpp_podpis" ? "dpp" : "prohlaseni"

    await supabase.from("document_records").upsert({
      brigadnik_id,
      mesic: mesicAnchor,
      typ: docType,
      stav: "podepsano",
      received_attachment_id: attachment_id,
      podepsano_at: new Date().toISOString(),
    }, { onConflict: "brigadnik_id,mesic,typ" })

    // F-0013 D-03: signDpp/signProhlaseni volá maybeAutoTransitionPipeline
    if (docType === "dpp") {
      await signDpp(brigadnik_id, rok)
    } else {
      await signProhlaseni(brigadnik_id, rok)
    }
  }

  // Audit log
  await supabase.from("historie").insert({
    brigadnik_id,
    user_id: currentUser?.id,
    typ: "dokument_klasifikovan",
    popis: `Příloha klasifikována jako ${classified_as}`,
    metadata: { attachment_id, classified_as, rok },
  })

  revalidatePath("/app/emaily")
  if (brigadnik_id) revalidatePath(`/app/brigadnici/${brigadnik_id}`)

  return { success: true }
}
