"use server"

import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAllowedCvType, isAllowedPhotoType, MAX_FILE_SIZE } from "@/lib/utils/sanitize"

// Rate limiting: max 5 submissions per email per 10 minutes
const submitAttempts = new Map<string, { count: number; resetAt: number }>()

function checkSubmitRateLimit(email: string): boolean {
  const now = Date.now()
  const key = `prihlaska:${email.toLowerCase()}`
  const entry = submitAttempts.get(key)
  if (!entry || now > entry.resetAt) {
    submitAttempts.set(key, { count: 1, resetAt: now + 600000 })
    return true
  }
  entry.count++
  return entry.count <= 5
}

const prihlaskaSchema = z.object({
  jmeno: z.string().min(1, "Jméno je povinné"),
  prijmeni: z.string().min(1, "Příjmení je povinné"),
  email: z.string().email("Neplatný email"),
  telefon: z.string().min(1, "Telefon je povinný"),
  nabidka_id: z.string().uuid(),
  gdpr: z.literal("on", { message: "Souhlas s GDPR je povinný" }),
})

export async function submitPrihlaska(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  const parsed = prihlaskaSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  // Rate limit check
  if (!checkSubmitRateLimit(parsed.data.email)) {
    return { error: "Příliš mnoho pokusů. Zkuste to za 10 minut." }
  }

  // Use admin client (service role) — public endpoint, no auth
  const supabase = createAdminClient()

  // Check for existing brigadnik with same email
  const { data: existing } = await supabase
    .from("brigadnici")
    .select("id")
    .eq("email", parsed.data.email)
    .limit(1)

  let brigadnikId: string

  if (existing && existing.length > 0 && existing[0]) {
    // Brigádník already exists — reuse
    brigadnikId = existing[0].id
  } else {
    // Create new brigádník
    const { data: newBrigadnik, error: insertError } = await supabase
      .from("brigadnici")
      .insert({
        jmeno: parsed.data.jmeno,
        prijmeni: parsed.data.prijmeni,
        email: parsed.data.email,
        telefon: parsed.data.telefon,
        zdroj: "web",
        gdpr_souhlas: true,
        gdpr_souhlas_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (insertError || !newBrigadnik) {
      return { error: "Nepodařilo se uložit přihlášku. Zkuste to znovu." }
    }

    brigadnikId = newBrigadnik.id
  }

  // Handle file uploads (CV + photo)
  const cvFile = formData.get("cv") as File | null
  const photoFile = formData.get("foto") as File | null

  let cvUrl: string | null = null
  let fotoUrl: string | null = null

  if (cvFile && cvFile.size > 0) {
    if (cvFile.size > MAX_FILE_SIZE) return { error: "CV soubor je příliš velký (max 20 MB)" }
    if (!isAllowedCvType(cvFile.type)) return { error: "Nepodporovaný formát CV. Povolené: PDF, DOC, DOCX." }

    const ext = cvFile.name.split(".").pop() ?? "pdf"
    const cvPath = `prihlasky/${brigadnikId}/cv/CV_${parsed.data.prijmeni}_${parsed.data.jmeno}.${ext}`
    const buffer = Buffer.from(await cvFile.arrayBuffer())

    const { error: cvUploadError } = await supabase.storage
      .from("crewmate-storage")
      .upload(cvPath, buffer, { contentType: cvFile.type, upsert: true })

    if (!cvUploadError) {
      cvUrl = cvPath
    }
  }

  if (photoFile && photoFile.size > 0) {
    if (photoFile.size > MAX_FILE_SIZE) return { error: "Foto soubor je příliš velký (max 20 MB)" }
    if (!isAllowedPhotoType(photoFile.type)) return { error: "Nepodporovaný formát foto. Povolené: JPG, PNG, HEIC." }

    const ext = photoFile.name.split(".").pop() ?? "jpg"
    const photoPath = `prihlasky/${brigadnikId}/foto/foto_${parsed.data.prijmeni}_${parsed.data.jmeno}.${ext}`
    const buffer = Buffer.from(await photoFile.arrayBuffer())

    const { error: photoUploadError } = await supabase.storage
      .from("crewmate-storage")
      .upload(photoPath, buffer, { contentType: photoFile.type, upsert: true })

    if (!photoUploadError) {
      fotoUrl = photoPath
    }
  }

  // Update brigadnik with file URLs if uploaded
  if (cvUrl || fotoUrl) {
    const updates: Record<string, string> = {}
    if (cvUrl) updates.cv_url = cvUrl
    if (fotoUrl) updates.foto_url = fotoUrl
    await supabase.from("brigadnici").update(updates).eq("id", brigadnikId)
  }

  // Add to pipeline as "zajemce"
  const { error: pipelineError } = await supabase
    .from("pipeline_entries")
    .insert({
      brigadnik_id: brigadnikId,
      nabidka_id: parsed.data.nabidka_id,
      stav: "zajemce",
    })

  if (pipelineError) {
    if (pipelineError.code === "23505") {
      // Already in pipeline — that's ok
      return { success: true }
    }
    return { error: "Nepodařilo se uložit přihlášku. Zkuste to znovu." }
  }

  // Audit log
  await supabase.from("historie").insert({
    brigadnik_id: brigadnikId,
    nabidka_id: parsed.data.nabidka_id,
    typ: "pipeline_zmena",
    popis: `Přihláška z webu: ${parsed.data.jmeno} ${parsed.data.prijmeni}${cvUrl ? " (+ CV)" : ""}${fotoUrl ? " (+ foto)" : ""}`,
  })

  return { success: true }
}
