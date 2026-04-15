"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const dochazkaSchema = z.object({
  prirazeni_id: z.string().uuid(),
  akce_id: z.string().uuid(),
  brigadnik_id: z.string().uuid(),
  pin: z.string().min(1, "PIN je povinný"),
  prichod: z.string().optional(),
  odchod: z.string().optional(),
  hodnoceni: z.coerce.number().int().min(1).max(5).optional(),
  poznamka: z.string().optional(),
})

// Simple in-memory rate limiting (per process — sufficient for serverless)
const pinAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string, maxAttempts: number = 5, windowMs: number = 60000): boolean {
  const now = Date.now()
  const entry = pinAttempts.get(key)
  if (!entry || now > entry.resetAt) {
    pinAttempts.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count++
  return entry.count <= maxAttempts
}

export async function verifyPin(akceId: string, pin: string) {
  // Rate limit: 5 attempts per minute per akce
  if (!checkRateLimit(`pin:${akceId}`)) {
    return { error: "Příliš mnoho pokusů. Zkuste to za minutu." }
  }

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

export async function getDochazkaByAkce(akceId: string, pin: string) {
  // Verify PIN before returning data
  const supabase = createAdminClient()
  const { data: akce } = await supabase
    .from("akce")
    .select("pin_kod")
    .eq("id", akceId)
    .single()

  if (!akce || akce.pin_kod !== pin) {
    return []
  }

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

  // Verify PIN before saving
  const supabase = createAdminClient()
  const { data: akce } = await supabase
    .from("akce")
    .select("pin_kod")
    .eq("id", parsed.data.akce_id)
    .single()

  if (!akce || akce.pin_kod !== parsed.data.pin) {
    return { error: "Neplatný PIN" }
  }

  // Upsert — update if exists, insert if not
  const { data: existing } = await supabase
    .from("dochazka")
    .select("id")
    .eq("prirazeni_id", parsed.data.prirazeni_id)
    .single()

  const dochazkaData = {
    prichod: parsed.data.prichod || null,
    odchod: parsed.data.odchod || null,
    hodnoceni: parsed.data.hodnoceni || null,
    poznamka: parsed.data.poznamka || null,
  }

  if (existing) {
    const { error } = await supabase
      .from("dochazka")
      .update(dochazkaData)
      .eq("id", existing.id)

    if (error) return { error: "Nepodařilo se uložit docházku" }
  } else {
    const { error } = await supabase
      .from("dochazka")
      .insert({
        prirazeni_id: parsed.data.prirazeni_id,
        akce_id: parsed.data.akce_id,
        brigadnik_id: parsed.data.brigadnik_id,
        ...dochazkaData,
      })

    if (error) return { error: "Nepodařilo se uložit docházku" }
  }

  return { success: true }
}

const dochazkaAuthSchema = z.object({
  prirazeni_id: z.string().uuid("Neplatné ID přiřazení"),
  akce_id: z.string().uuid("Neplatné ID akce"),
  brigadnik_id: z.string().uuid("Neplatné ID brigádníka"),
  prichod: z.string().optional(),
  odchod: z.string().optional(),
  hodnoceni: z.coerce.number().int().min(1).max(5).optional(),
  poznamka: z.string().optional(),
})

export async function saveDochazkaAuth(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = dochazkaAuthSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from("dochazka")
    .select("id")
    .eq("prirazeni_id", parsed.data.prirazeni_id)
    .single()

  const dochazkaData = {
    prichod: parsed.data.prichod || null,
    odchod: parsed.data.odchod || null,
    hodnoceni: parsed.data.hodnoceni || null,
    poznamka: parsed.data.poznamka || null,
  }

  if (existing) {
    const { error } = await adminClient.from("dochazka").update(dochazkaData).eq("id", existing.id)
    if (error) return { error: "Nepodařilo se uložit docházku" }
  } else {
    const { error } = await adminClient.from("dochazka").insert({
      prirazeni_id: parsed.data.prirazeni_id,
      akce_id: parsed.data.akce_id,
      brigadnik_id: parsed.data.brigadnik_id,
      ...dochazkaData,
    })
    if (error) return { error: "Nepodařilo se uložit docházku" }
  }

  return { success: true }
}
