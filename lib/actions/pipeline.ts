"use server"

import { revalidatePath } from "next/cache"
import sanitizeHtml from "sanitize-html"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { updatePipelinePoznamkaSchema } from "@/lib/schemas/hodnoceni"

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

/**
 * F-0013 D-F0013-03 — auto-transition helper.
 *
 * Přesune všechny `pipeline_entries` daného brigádníka ze stavu
 * `prijaty_nehotova_admin` do `prijaty_vse_vyreseno` a zapíše audit log
 * s důvodem (`dpp_podepsano` | `osvc_flag`).
 *
 * Volaný interně z:
 *  - signDpp() po podpisu DPP
 *  - signProhlaseni() po podpisu prohlášení (nezávisle — auditní completeness)
 *  - updateBrigadnikTyp('osvc') po přepnutí na OSVČ
 *  - submitDotaznik() pokud typ=osvc a brigádník je v pipeline
 *
 * Idempotentní: druhé volání nic neflipne (WHERE stav='prijaty_nehotova_admin').
 * Jednosměrný — nikdy se nevrací zpět.
 */
export async function maybeAutoTransitionPipeline(
  brigadnikId: string,
  reason: "dpp_podepsano" | "prohlaseni_podepsano" | "osvc_flag" = "dpp_podepsano"
): Promise<{ transitioned: string[]; nabidkaIds: string[] }> {
  const admin = createAdminClient()

  const { data: entries } = await admin
    .from("pipeline_entries")
    .select("id, nabidka_id")
    .eq("brigadnik_id", brigadnikId)
    .eq("stav", "prijaty_nehotova_admin")

  const toFlip = entries ?? []
  if (toFlip.length === 0) return { transitioned: [], nabidkaIds: [] }

  const ids = toFlip.map(e => e.id)
  const nabidkaIds = [...new Set(toFlip.map(e => e.nabidka_id))]

  const { error: updateErr } = await admin
    .from("pipeline_entries")
    .update({ stav: "prijaty_vse_vyreseno" })
    .in("id", ids)

  if (updateErr) {
    console.error("maybeAutoTransitionPipeline update error:", updateErr)
    return { transitioned: [], nabidkaIds: [] }
  }

  // 1 audit entry per dotčenou pipeline_entry (per D-F0013-06 per-row granularity).
  const historieRows = toFlip.map(e => ({
    brigadnik_id: brigadnikId,
    nabidka_id: e.nabidka_id,
    typ: "pipeline_auto_transition",
    popis: `Auto přechod NH→VV (${reason})`,
    metadata: { reason, pipeline_entry_id: e.id },
  }))

  await admin.from("historie").insert(historieRows)

  for (const nabidkaId of nabidkaIds) {
    revalidatePath(`/app/nabidky/${nabidkaId}`)
  }

  return { transitioned: ids, nabidkaIds }
}

/**
 * F-0016 US-1E-1: update poznámky na pipeline_entries (scratchpad per-zakázka).
 *
 * - Sanitizace: strip VŠECHNY HTML tagy (allowedTags: [], allowedAttributes: {}).
 * - Max 500 znaků (Zod) — orientační, ne DB-enforced.
 * - Prázdný text → NULL (žádný empty string v DB).
 * - Žádný audit do historie (D-F0016, scratchpad — mění se často, nezajímá nás).
 */
export async function updatePipelineEntryPoznamka(
  entryId: string,
  text: string
): Promise<{ success: true } | { error: string }> {
  const parsed = updatePipelinePoznamkaSchema.safeParse({ entry_id: entryId, text })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  // Strip all HTML — scratchpad je plain-text only (React escape už řeší render,
  // ale defense-in-depth na save).
  const cleaned = sanitizeHtml(parsed.data.text, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim()
  const finalText = cleaned.length === 0 ? null : cleaned

  const { data: entry } = await supabase
    .from("pipeline_entries")
    .select("id, nabidka_id")
    .eq("id", parsed.data.entry_id)
    .single()

  if (!entry) return { error: "Pipeline entry nenalezen" }

  const { error } = await supabase
    .from("pipeline_entries")
    .update({ poznamky: finalText })
    .eq("id", parsed.data.entry_id)

  if (error) return { error: error.message }

  revalidatePath(`/app/nabidky/${entry.nabidka_id}`)
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
