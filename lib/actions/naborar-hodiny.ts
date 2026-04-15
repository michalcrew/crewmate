"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const hodinySchema = z.object({
  datum: z.string().min(1, "Datum je povinné"),
  hodin: z.coerce.number().min(0.5, "Minimum 0.5 hodiny").max(24, "Maximum 24 hodin"),
  misto_prace: z.enum(["kancelar", "remote", "akce"], { message: "Vyberte místo práce" }),
  napln_prace: z.string().min(1, "Náplň práce je povinná"),
  je_zpetny_zapis: z.string().optional(),
  duvod_zpozdeni: z.string().optional(),
})

export async function getMyHodiny(mesic?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  if (!profile) return []

  let query = supabase
    .from("naborar_hodiny")
    .select("*")
    .eq("user_id", profile.id)
    .order("datum", { ascending: false })

  if (mesic) {
    const start = `${mesic}-01`
    const nextM = Number(mesic.split("-")[1]) === 12 ? 1 : Number(mesic.split("-")[1]) + 1
    const nextY = Number(mesic.split("-")[1]) === 12 ? Number(mesic.split("-")[0]) + 1 : Number(mesic.split("-")[0])
    const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`
    query = query.gte("datum", start).lt("datum", end)
  }

  const { data } = await query
  return data ?? []
}

export async function zapsatHodiny(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { data: profile } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  if (!profile) return { error: "Profil nenalezen" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = hodinySchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  // Check if this is a late entry (more than 1 day after the date)
  const entryDate = new Date(parsed.data.datum)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
  const isLate = diffDays > 1

  if (isLate && !parsed.data.duvod_zpozdeni) {
    return { error: "Zpětný zápis vyžaduje uvedení důvodu zpoždění" }
  }

  const { error } = await supabase.from("naborar_hodiny").insert({
    user_id: profile.id,
    datum: parsed.data.datum,
    hodin: parsed.data.hodin,
    misto_prace: parsed.data.misto_prace,
    napln_prace: parsed.data.napln_prace,
    je_zpetny_zapis: isLate,
    duvod_zpozdeni: isLate ? parsed.data.duvod_zpozdeni : null,
  })

  if (error) {
    if (error.code === "23505") return { error: "Pro tento den už máte záznam" }
    return { error: "Nepodařilo se uložit" }
  }

  revalidatePath("/app/hodiny")
  return { success: true }
}

// Admin: přehled všech náborářek
export async function getAllHodiny(mesic: string) {
  const supabase = await createClient()

  const start = `${mesic}-01`
  const nextM = Number(mesic.split("-")[1]) === 12 ? 1 : Number(mesic.split("-")[1]) + 1
  const nextY = Number(mesic.split("-")[1]) === 12 ? Number(mesic.split("-")[0]) + 1 : Number(mesic.split("-")[0])
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`

  const { data } = await supabase
    .from("naborar_hodiny")
    .select("*, naborar:users!naborar_hodiny_user_id_fkey(jmeno, prijmeni, email)")
    .gte("datum", start)
    .lt("datum", end)
    .order("datum", { ascending: false })

  return data ?? []
}

// Admin: souhrn per náborářka
export async function getHodinySouhrn(mesic: string) {
  const supabase = await createClient()

  const start = `${mesic}-01`
  const nextM = Number(mesic.split("-")[1]) === 12 ? 1 : Number(mesic.split("-")[1]) + 1
  const nextY = Number(mesic.split("-")[1]) === 12 ? Number(mesic.split("-")[0]) + 1 : Number(mesic.split("-")[0])
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`

  const { data } = await supabase
    .from("naborar_hodiny")
    .select("user_id, hodin, naborar:users!naborar_hodiny_user_id_fkey(jmeno, prijmeni)")
    .gte("datum", start)
    .lt("datum", end)

  if (!data) return []

  // Aggregate per user
  const map = new Map<string, { jmeno: string; prijmeni: string; celkem: number; dnu: number }>()
  for (const row of data) {
    const nab = row.naborar as unknown as { jmeno: string; prijmeni: string } | null
    if (!nab) continue
    const existing = map.get(row.user_id)
    if (existing) {
      existing.celkem += Number(row.hodin)
      existing.dnu += 1
    } else {
      map.set(row.user_id, { jmeno: nab.jmeno, prijmeni: nab.prijmeni, celkem: Number(row.hodin), dnu: 1 })
    }
  }

  return [...map.values()]
}
