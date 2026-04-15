"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

export async function getDokumentSablony() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("dokument_sablony")
    .select("*")
    .order("typ", { ascending: true })
    .order("platnost_od", { ascending: false })

  return data ?? []
}

const sablonSchema = z.object({
  nazev: z.string().min(1, "Název je povinný"),
  typ: z.enum(["dpp", "prohlaseni"]),
  obsah_html: z.string().min(1, "Obsah je povinný"),
  platnost_od: z.string().min(1, "Platnost od je povinná"),
  platnost_do: z.string().optional(),
  poznamka: z.string().optional(),
})

export async function createDokumentSablona(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = sablonSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  const { error } = await supabase.from("dokument_sablony").insert({
    ...parsed.data,
    platnost_do: parsed.data.platnost_do || null,
  })

  if (error) return { error: error.message }
  revalidatePath("/app/sablony")
  return { success: true }
}

export async function toggleSablonaActive(id: string, aktivni: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("dokument_sablony")
    .update({ aktivni })
    .eq("id", id)

  if (error) return { error: error.message }
  revalidatePath("/app/sablony")
  return { success: true }
}
