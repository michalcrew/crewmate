"use server"

import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"

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
    popis: `Přihláška z webu: ${parsed.data.jmeno} ${parsed.data.prijmeni}`,
  })

  return { success: true }
}
