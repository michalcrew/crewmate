"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { resolveInternalUserId } from "@/lib/utils/internal-user"
import {
  addHodnoceniSchema,
  updateHodnoceniSchema,
} from "@/lib/schemas/hodnoceni"

/**
 * F-0016 Hodnocení brigádníka — CRUD server actions.
 *
 * D-F0016-04 (volba C): VŠICHNI authenticated mohou CRUD bez autor/admin guardu.
 * D-F0016-05: FK hodnotil_user_id ON DELETE SET NULL → UI zobrazí „Smazaný uživatel".
 *
 * Audit trail v `historie`:
 *   - hodnoceni_pridano   — INSERT
 *   - hodnoceni_upraveno  — UPDATE s diff
 *   - hodnoceni_smazano   — DELETE se snapshotem
 */

type ActionResult<T = unknown> =
  | ({ success: true } & T)
  | { error: string }

// Internal user lookup s email fallbackem (lib/utils/internal-user.ts).
const getInternalUserId = resolveInternalUserId

/**
 * US-1C-1: Přidat hodnocení. akce_id NULLABLE (D-F0016-01).
 */
export async function addHodnoceni(
  brigadnikId: string,
  hodnoceni: number,
  poznamka?: string | null,
  akceId?: string | null
): Promise<ActionResult<{ id: string }>> {
  const parsed = addHodnoceniSchema.safeParse({
    brigadnik_id: brigadnikId,
    hodnoceni,
    poznamka: poznamka ?? null,
    akce_id: akceId ?? null,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const internalUserId = await getInternalUserId(user.id, user.email)
  if (!internalUserId) return { error: "Interní uživatel nenalezen — zkontrolujte propojení účtu (kód U2)" }

  const { data, error } = await supabase
    .from("hodnoceni_brigadnika")
    .insert({
      brigadnik_id: parsed.data.brigadnik_id,
      hodnoceni: parsed.data.hodnoceni,
      poznamka: parsed.data.poznamka ?? null,
      akce_id: parsed.data.akce_id ?? null,
      hodnotil_user_id: internalUserId,
    })
    .select("id")
    .single()

  if (error || !data) return { error: error?.message ?? "Nepodařilo se uložit" }

  await supabase.from("historie").insert({
    brigadnik_id: parsed.data.brigadnik_id,
    akce_id: parsed.data.akce_id ?? null,
    user_id: internalUserId,
    typ: "hodnoceni_pridano",
    popis: `Přidáno hodnocení ${parsed.data.hodnoceni}/5`,
    metadata: {
      hodnoceni_id: data.id,
      hodnoceni: parsed.data.hodnoceni,
      akce_id: parsed.data.akce_id ?? null,
    },
  })

  revalidatePath(`/app/brigadnici/${parsed.data.brigadnik_id}`)
  return { success: true, id: data.id }
}

/**
 * Update hodnocení (bez autor guardu — D-F0016-04=C).
 * Vrací noop (success bez diff) pokud se nic nezměnilo.
 */
export async function updateHodnoceni(
  id: string,
  patch: {
    hodnoceni?: number
    poznamka?: string | null
    akceId?: string | null
  }
): Promise<ActionResult> {
  const parsed = updateHodnoceniSchema.safeParse({
    hodnoceni: patch.hodnoceni,
    poznamka: patch.poznamka,
    akce_id: patch.akceId,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const internalUserId = await getInternalUserId(user.id, user.email)
  if (!internalUserId) return { error: "Interní uživatel nenalezen — zkontrolujte propojení účtu (kód U2)" }

  const { data: current, error: loadErr } = await supabase
    .from("hodnoceni_brigadnika")
    .select("id, brigadnik_id, hodnoceni, poznamka, akce_id")
    .eq("id", id)
    .single()

  if (loadErr || !current) return { error: "Hodnocení nenalezeno" }

  const update: Record<string, unknown> = {}
  const diffs: Record<string, { old: unknown; new: unknown }> = {}

  if (parsed.data.hodnoceni !== undefined && parsed.data.hodnoceni !== current.hodnoceni) {
    update.hodnoceni = parsed.data.hodnoceni
    diffs.hodnoceni = { old: current.hodnoceni, new: parsed.data.hodnoceni }
  }
  if (parsed.data.poznamka !== undefined) {
    const newPoz = parsed.data.poznamka === "" ? null : parsed.data.poznamka
    if (newPoz !== current.poznamka) {
      update.poznamka = newPoz
      diffs.poznamka = { old: current.poznamka, new: newPoz }
    }
  }
  if (parsed.data.akce_id !== undefined && parsed.data.akce_id !== current.akce_id) {
    update.akce_id = parsed.data.akce_id
    diffs.akce_id = { old: current.akce_id, new: parsed.data.akce_id }
  }

  if (Object.keys(diffs).length === 0) {
    return { success: true }
  }

  const { error: updErr } = await supabase
    .from("hodnoceni_brigadnika")
    .update(update)
    .eq("id", id)

  if (updErr) return { error: updErr.message }

  await supabase.from("historie").insert({
    brigadnik_id: current.brigadnik_id,
    akce_id: (update.akce_id as string | null | undefined) ?? current.akce_id ?? null,
    user_id: internalUserId,
    typ: "hodnoceni_upraveno",
    popis: `Upraveno hodnocení (${Object.keys(diffs).length} pole)`,
    metadata: { hodnoceni_id: id, diffs },
  })

  revalidatePath(`/app/brigadnici/${current.brigadnik_id}`)
  return { success: true }
}

/**
 * Delete hodnocení (bez autor guardu — D-F0016-04=C).
 * Snapshot v historie.metadata pro audit traceability.
 */
export async function deleteHodnoceni(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const internalUserId = await getInternalUserId(user.id, user.email)
  if (!internalUserId) return { error: "Interní uživatel nenalezen — zkontrolujte propojení účtu (kód U2)" }

  const { data: current } = await supabase
    .from("hodnoceni_brigadnika")
    .select("id, brigadnik_id, akce_id, hodnoceni, poznamka, hodnotil_user_id, created_at")
    .eq("id", id)
    .single()

  if (!current) return { error: "Hodnocení nenalezeno" }

  const { error } = await supabase
    .from("hodnoceni_brigadnika")
    .delete()
    .eq("id", id)

  if (error) return { error: error.message }

  await supabase.from("historie").insert({
    brigadnik_id: current.brigadnik_id,
    akce_id: current.akce_id,
    user_id: internalUserId,
    typ: "hodnoceni_smazano",
    popis: `Smazáno hodnocení ${current.hodnoceni}/5`,
    metadata: { snapshot: current },
  })

  revalidatePath(`/app/brigadnici/${current.brigadnik_id}`)
  return { success: true }
}

/**
 * Loader pro HodnoceniList v detailu brigádníka.
 * JOIN autor (users) + akce. LEFT JOIN — smazaný autor/akce = NULL.
 */
export async function getHodnoceniByBrigadnik(brigadnikId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("hodnoceni_brigadnika")
    .select(
      `
      id, hodnoceni, poznamka, akce_id, hodnotil_user_id, created_at, updated_at,
      autor:users(id, jmeno, prijmeni),
      akce:akce(id, nazev, datum)
    `
    )
    .eq("brigadnik_id", brigadnikId)
    .order("created_at", { ascending: false })

  if (error) return []
  return data ?? []
}
