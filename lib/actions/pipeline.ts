"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function getPipelineByNabidka(nabidkaId: string) {
  const supabase = await createClient()

  // Query without FK hint for naborar (FK name may differ between environments)
  const { data, error } = await supabase
    .from("pipeline_entries")
    .select("*, brigadnik:brigadnici(id, jmeno, prijmeni, email, telefon, dotaznik_vyplnen)")
    .eq("nabidka_id", nabidkaId)
    .order("updated_at", { ascending: false })

  if (error) throw error

  // Enrich with naborar names separately
  const naborarIds = [...new Set((data ?? []).map(d => d.naborar_id).filter(Boolean))] as string[]
  const naborarMap = new Map<string, { jmeno: string; prijmeni: string }>()

  if (naborarIds.length > 0) {
    const { data: naborari } = await supabase
      .from("users")
      .select("id, jmeno, prijmeni")
      .in("id", naborarIds)

    for (const n of naborari ?? []) {
      naborarMap.set(n.id, { jmeno: n.jmeno, prijmeni: n.prijmeni })
    }
  }

  return (data ?? []).map(d => ({
    ...d,
    naborar: d.naborar_id ? naborarMap.get(d.naborar_id) ?? null : null,
  }))
}

export async function updatePipelineStav(
  entryId: string,
  stav: string,
  nabidkaId: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { error } = await supabase
    .from("pipeline_entries")
    .update({ stav })
    .eq("id", entryId)

  if (error) return { error: error.message }

  // Audit log
  const { data: entry } = await supabase
    .from("pipeline_entries")
    .select("brigadnik_id")
    .eq("id", entryId)
    .single()

  if (entry) {
    const { data: internalUser } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", user.id)
      .single()

    await supabase.from("historie").insert({
      brigadnik_id: entry.brigadnik_id,
      nabidka_id: nabidkaId,
      user_id: internalUser?.id,
      typ: "pipeline_zmena",
      popis: `Stav změněn na: ${stav}`,
    })
  }

  revalidatePath(`/app/nabidky/${nabidkaId}`)
  return { success: true }
}

export async function addBrigadnikToPipeline(
  brigadnikId: string,
  nabidkaId: string,
  stav: string = "zajemce"
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { data: internalUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  const { error } = await supabase.from("pipeline_entries").insert({
    brigadnik_id: brigadnikId,
    nabidka_id: nabidkaId,
    stav,
    naborar_id: internalUser?.id,
  })

  if (error) {
    if (error.code === "23505") return { error: "Brigádník je již v pipeline této nabídky" }
    return { error: error.message }
  }

  revalidatePath(`/app/nabidky/${nabidkaId}`)
  return { success: true }
}
