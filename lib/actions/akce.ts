"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const akceSchema = z.object({
  nazev: z.string().min(1, "Název je povinný"),
  datum: z.string().min(1, "Datum je povinné"),
  cas_od: z.string().optional(),
  cas_do: z.string().optional(),
  misto: z.string().optional(),
  klient: z.string().optional(),
  nabidka_id: z.string().optional(),
  pocet_lidi: z.coerce.number().int().positive().optional(),
  poznamky: z.string().optional(),
})

export async function getAkce(filter?: { mesic?: string }) {
  const supabase = await createClient()
  let query = supabase
    .from("akce")
    .select("*, nabidka:nabidky(id, nazev), prirazeni_count:prirazeni(count)")
    .order("datum", { ascending: false })

  if (filter?.mesic) {
    const start = `${filter.mesic}-01`
    const [y, m] = filter.mesic.split("-").map(Number)
    const nextM = (m ?? 0) === 12 ? 1 : (m ?? 0) + 1; const nextY = (m ?? 0) === 12 ? (y ?? 0) + 1 : (y ?? 0); const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`
    query = query.gte("datum", start).lt("datum", end)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createAkce(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = akceSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  // Generate 6-digit PIN
  const pin_kod = String(Math.floor(100000 + Math.random() * 900000))

  const { error } = await supabase.from("akce").insert({
    ...parsed.data,
    cas_od: parsed.data.cas_od || null,
    cas_do: parsed.data.cas_do || null,
    nabidka_id: parsed.data.nabidka_id || null,
    pin_kod,
  })

  if (error) return { error: error.message }

  revalidatePath("/app/akce")
  return { success: true }
}

export async function getAkceById(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("akce")
    .select("*, nabidka:nabidky(id, nazev)")
    .eq("id", id)
    .single()
  return data
}

export async function getAkcePrirazeni(akceId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("prirazeni")
    .select(`
      *,
      brigadnik:brigadnici(id, jmeno, prijmeni, telefon, email),
      dochazka(id, prichod, odchod, hodin_celkem, hodnoceni, poznamka)
    `)
    .eq("akce_id", akceId)
    .order("status", { ascending: true })
    .order("poradi_nahradnik", { ascending: true })

  return data ?? []
}

export async function addPrirazeni(akceId: string, brigadnikId: string, pozice: string, status: string = "prirazeny") {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { error } = await supabase.from("prirazeni").insert({
    akce_id: akceId,
    brigadnik_id: brigadnikId,
    pozice: pozice || null,
    status,
  })

  if (error) {
    if (error.code === "23505") return { error: "Brigádník je již přiřazený na tuto akci" }
    return { error: error.message }
  }

  revalidatePath(`/app/akce/${akceId}`)
  return { success: true }
}
