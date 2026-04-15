"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const brigadnikSchema = z.object({
  jmeno: z.string().min(1, "Jméno je povinné"),
  prijmeni: z.string().min(1, "Příjmení je povinné"),
  email: z.string().email("Neplatný email"),
  telefon: z.string().min(1, "Telefon je povinný"),
  zdroj: z.enum(["web", "doporuceni", "recrujobs", "rucne", "import"]).optional(),
  poznamky: z.string().optional(),
})

export async function getBrigadnici(filter?: {
  search?: string
  aktivni?: boolean
}) {
  const supabase = await createClient()
  let query = supabase
    .from("v_brigadnici_aktualni")
    .select("*")
    .order("prijmeni", { ascending: true })

  if (filter?.aktivni !== false) {
    query = query.eq("aktivni", true)
  }

  if (filter?.search) {
    // Escape PostgREST special characters to prevent filter injection
    const s = filter.search.replace(/[%_,.()"'\\]/g, "")
    if (s.length > 0) {
      query = query.or(`jmeno.ilike.%${s}%,prijmeni.ilike.%${s}%,email.ilike.%${s}%,telefon.ilike.%${s}%`)
    }
  }

  const { data, error } = await query
  if (error) throw error

  // Enrich with action count and monthly DPP data
  const brigadnikIds = (data ?? []).map(b => b.id)

  if (brigadnikIds.length === 0) return data ?? []

  // Get action counts
  const { data: prirazeniData } = await supabase
    .from("prirazeni")
    .select("brigadnik_id")
    .in("brigadnik_id", brigadnikIds)
    .eq("status", "prirazeny")

  const actionCounts = new Map<string, number>()
  for (const p of prirazeniData ?? []) {
    actionCounts.set(p.brigadnik_id, (actionCounts.get(p.brigadnik_id) ?? 0) + 1)
  }

  // Get DPP status for current and next month
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`

  const { data: smluvniData } = await supabase
    .from("smluvni_stav")
    .select("brigadnik_id, mesic, dpp_stav")
    .in("brigadnik_id", brigadnikIds)
    .in("mesic", [currentMonth, nextMonthStr])

  const dppMap = new Map<string, { current: string; next: string }>()
  for (const s of smluvniData ?? []) {
    const existing = dppMap.get(s.brigadnik_id) ?? { current: "zadny", next: "zadny" }
    if (s.mesic === currentMonth) existing.current = s.dpp_stav
    if (s.mesic === nextMonthStr) existing.next = s.dpp_stav
    dppMap.set(s.brigadnik_id, existing)
  }

  // Merge data and sort: most actions first, then by rating
  const enriched = (data ?? []).map(b => ({
    ...b,
    pocet_akci: actionCounts.get(b.id) ?? 0,
    dpp_tento_mesic: dppMap.get(b.id)?.current ?? "zadny",
    dpp_pristi_mesic: dppMap.get(b.id)?.next ?? "zadny",
  }))

  enriched.sort((a, b) => {
    // Sort by action count DESC, then rating DESC, then name ASC
    if (b.pocet_akci !== a.pocet_akci) return b.pocet_akci - a.pocet_akci
    const ratingA = Number(a.prumerne_hodnoceni) || 0
    const ratingB = Number(b.prumerne_hodnoceni) || 0
    if (ratingB !== ratingA) return ratingB - ratingA
    return (a.prijmeni ?? "").localeCompare(b.prijmeni ?? "")
  })

  return enriched
}

export async function createBrigadnik(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = brigadnikSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  // Check for duplicate email
  const { data: existing } = await supabase
    .from("brigadnici")
    .select("id, jmeno, prijmeni")
    .eq("email", parsed.data.email)
    .limit(1)

  if (existing && existing.length > 0) {
    return {
      error: `Brigádník s emailem ${parsed.data.email} již existuje (${existing[0]?.jmeno} ${existing[0]?.prijmeni})`,
    }
  }

  const { data, error } = await supabase
    .from("brigadnici")
    .insert({
      ...parsed.data,
      zdroj: parsed.data.zdroj || "rucne",
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/app/brigadnici")
  return { success: true, id: data.id }
}

export async function updateBrigadnik(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())

  const { error } = await supabase
    .from("brigadnici")
    .update({
      jmeno: raw.jmeno as string || undefined,
      prijmeni: raw.prijmeni as string || undefined,
      email: raw.email as string || undefined,
      telefon: raw.telefon as string || undefined,
      poznamky: (raw.poznamky as string) || null,
    })
    .eq("id", id)

  if (error) return { error: error.message }

  revalidatePath(`/app/brigadnici/${id}`)
  revalidatePath("/app/brigadnici")
  return { success: true }
}

export async function getBrigadnikById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("brigadnici")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return null
  return data
}

export async function getBrigadnikZkusenosti(brigadnikId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("pracovni_zkusenosti")
    .select("*, akce:akce(nazev, datum)")
    .eq("brigadnik_id", brigadnikId)
    .order("datum_od", { ascending: false })

  return data ?? []
}

export async function getBrigadnikPipeline(brigadnikId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pipeline_entries")
    .select("*, nabidka:nabidky(id, nazev, typ, stav)")
    .eq("brigadnik_id", brigadnikId)
    .order("created_at", { ascending: false })

  if (error) return []
  return data
}

export async function getBrigadnikSmluvniStav(brigadnikId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("smluvni_stav")
    .select("*")
    .eq("brigadnik_id", brigadnikId)
    .order("mesic", { ascending: false })

  if (error) return []
  return data
}

export async function getBrigadnikHistorie(brigadnikId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("historie")
    .select("*")
    .eq("brigadnik_id", brigadnikId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) return []
  return data
}
