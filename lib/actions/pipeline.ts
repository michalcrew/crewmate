"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function getPipelineByNabidka(nabidkaId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pipeline_entries")
    .select("*, brigadnik:brigadnici(id, jmeno, prijmeni, email, telefon, dotaznik_vyplnen)")
    .eq("nabidka_id", nabidkaId)
    .order("updated_at", { ascending: false })

  if (error) throw error
  return data
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
