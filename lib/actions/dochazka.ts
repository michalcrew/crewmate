"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const dochazkaSchema = z.object({
  prirazeni_id: z.string().uuid(),
  akce_id: z.string().uuid(),
  brigadnik_id: z.string().uuid(),
  prichod: z.string().optional(),
  odchod: z.string().optional(),
  hodnoceni: z.coerce.number().int().min(1).max(5).optional(),
  poznamka: z.string().optional(),
})

export async function verifyPin(akceId: string, pin: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("akce")
    .select("id, nazev, datum, cas_od, cas_do, misto, pin_kod")
    .eq("id", akceId)
    .single()

  if (!data || data.pin_kod !== pin) {
    return { error: "Neplatný PIN" }
  }

  return { success: true, akce: { id: data.id, nazev: data.nazev, datum: data.datum, cas_od: data.cas_od, cas_do: data.cas_do, misto: data.misto } }
}

export async function getDochazkaByAkce(akceId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("prirazeni")
    .select(`
      id,
      brigadnik:brigadnici(id, jmeno, prijmeni),
      pozice,
      status,
      dochazka(id, prichod, odchod, hodin_celkem, hodnoceni, poznamka)
    `)
    .eq("akce_id", akceId)
    .eq("status", "prirazeny")
    .order("created_at", { ascending: true })

  return data ?? []
}

export async function saveDochazka(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  const parsed = dochazkaSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const supabase = createAdminClient()

  // Upsert — update if exists, insert if not
  const { data: existing } = await supabase
    .from("dochazka")
    .select("id")
    .eq("prirazeni_id", parsed.data.prirazeni_id)
    .single()

  if (existing) {
    const { error } = await supabase
      .from("dochazka")
      .update({
        prichod: parsed.data.prichod || null,
        odchod: parsed.data.odchod || null,
        hodnoceni: parsed.data.hodnoceni || null,
        poznamka: parsed.data.poznamka || null,
      })
      .eq("id", existing.id)

    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from("dochazka")
      .insert({
        prirazeni_id: parsed.data.prirazeni_id,
        akce_id: parsed.data.akce_id,
        brigadnik_id: parsed.data.brigadnik_id,
        prichod: parsed.data.prichod || null,
        odchod: parsed.data.odchod || null,
        hodnoceni: parsed.data.hodnoceni || null,
        poznamka: parsed.data.poznamka || null,
      })

    if (error) return { error: error.message }
  }

  return { success: true }
}

export async function saveDochazkaAuth(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  return saveDochazka(formData)
}
