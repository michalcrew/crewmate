"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function getOrCreateSmluvniStav(brigadnikId: string, mesic: string) {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("smluvni_stav")
    .select("*")
    .eq("brigadnik_id", brigadnikId)
    .eq("mesic", `${mesic}-01`)
    .single()

  if (existing) return existing

  const { data: created, error } = await supabase
    .from("smluvni_stav")
    .insert({ brigadnik_id: brigadnikId, mesic: `${mesic}-01` })
    .select("*")
    .single()

  if (error) throw error
  return created
}

export async function updateDppStav(
  smluvniStavId: string,
  brigadnikId: string,
  stav: string,
  dokumentId?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const update: Record<string, unknown> = { dpp_stav: stav }
  if (stav === "vygenerovano") update.dpp_vygenerovano_at = new Date().toISOString()
  if (stav === "odeslano") update.dpp_odeslano_at = new Date().toISOString()
  if (stav === "podepsano") update.dpp_podepsano_at = new Date().toISOString()
  if (dokumentId) update.dpp_dokument_id = dokumentId

  const { error } = await supabase
    .from("smluvni_stav")
    .update(update)
    .eq("id", smluvniStavId)

  if (error) return { error: error.message }

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return { success: true }
}

export async function updateProhlaseniStav(
  smluvniStavId: string,
  brigadnikId: string,
  stav: string,
  dokumentId?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const update: Record<string, unknown> = { prohlaseni_stav: stav }
  if (stav === "vygenerovano") update.prohlaseni_vygenerovano_at = new Date().toISOString()
  if (stav === "odeslano") update.prohlaseni_odeslano_at = new Date().toISOString()
  if (stav === "podepsano") update.prohlaseni_podepsano_at = new Date().toISOString()
  if (dokumentId) update.prohlaseni_dokument_id = dokumentId

  const { error } = await supabase
    .from("smluvni_stav")
    .update(update)
    .eq("id", smluvniStavId)

  if (error) return { error: error.message }

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return { success: true }
}
