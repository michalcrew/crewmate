"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const nabidkaSchema = z.object({
  nazev: z.string().min(1, "Název je povinný"),
  typ: z.enum(["jednorazova", "prubezna"]),
  klient: z.string().optional(),
  typ_pozice: z.string().optional(),
  popis_prace: z.string().optional(),
  pozadavky: z.string().optional(),
  odmena: z.string().optional(),
  misto: z.string().optional(),
  datum_od: z.string().optional(),
  datum_do: z.string().optional(),
  pocet_lidi: z.coerce.number().int().positive().optional(),
  slug: z.string().optional(),
  zverejnena: z.boolean().optional(),
})

export async function getNabidky(filter?: { filtr?: string }) {
  const supabase = await createClient()
  let query = supabase
    .from("nabidky")
    .select("*, pipeline_entries(id, stav)")
    .order("created_at", { ascending: false })

  if (filter?.filtr === "aktivni") {
    query = query.eq("typ", "aktivni").neq("stav", "ukoncena")
  } else if (filter?.filtr === "stala") {
    query = query.eq("typ", "stala").neq("stav", "ukoncena")
  } else if (filter?.filtr === "ukoncena") {
    query = query.eq("stav", "ukoncena")
  }

  const { data, error } = await query
  if (error) throw error

  // Aggregate pipeline counts
  return (data ?? []).map(n => {
    const entries = (n.pipeline_entries ?? []) as { stav: string }[]
    return {
      ...n,
      pipeline_entries: undefined,
      stats: {
        celkem: entries.length,
        zajemci: entries.filter(e => e.stav === "zajemce").length,
        prijati: entries.filter(e => ["prijaty_nehotova_admin", "prijaty_vse_vyreseno"].includes(e.stav)).length,
        vyreseno: entries.filter(e => e.stav === "prijaty_vse_vyreseno").length,
        odmitnuty: entries.filter(e => e.stav === "odmitnuty").length,
      }
    }
  })
}

export async function createNabidka(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = nabidkaSchema.safeParse({
    ...raw,
    zverejnena: raw.zverejnena === "on",
    pocet_lidi: raw.pocet_lidi || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const slug = parsed.data.slug || parsed.data.nazev
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  // Get user's internal ID for naborar_id
  const { data: internalUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  const { error } = await supabase.from("nabidky").insert({
    ...parsed.data,
    slug,
    datum_od: parsed.data.datum_od || null,
    datum_do: parsed.data.datum_do || null,
    naborar_id: internalUser?.id ?? null,
  })

  if (error) {
    if (error.code === "23505") return { error: "Nabídka s tímto slugem již existuje" }
    return { error: error.message }
  }

  revalidatePath("/app/nabidky")
  return { success: true }
}

export async function updateNabidka(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = nabidkaSchema.safeParse({
    ...raw,
    zverejnena: raw.zverejnena === "on",
    pocet_lidi: raw.pocet_lidi || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const { error } = await supabase
    .from("nabidky")
    .update({
      ...parsed.data,
      datum_od: parsed.data.datum_od || null,
      datum_do: parsed.data.datum_do || null,
    })
    .eq("id", id)

  if (error) return { error: error.message }

  revalidatePath(`/app/nabidky/${id}`)
  revalidatePath("/app/nabidky")
  return { success: true }
}

export async function updateNabidkaStav(id: string, stav: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { error } = await supabase
    .from("nabidky")
    .update({ stav })
    .eq("id", id)

  if (error) return { error: error.message }

  revalidatePath("/app/nabidky")
  return { success: true }
}

export async function getNabidkaById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("nabidky")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return null
  return data
}
