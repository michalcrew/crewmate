"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { maybeAutoTransitionPipeline } from "./pipeline"
import { signDppInputSchema, ukoncitDppInputSchema } from "@/lib/schemas/dotaznik"

/**
 * F-0013: per-rok smluvni_stav.
 *
 * `rok` je INT (2020..2100). 1 řádek per (brigadnik_id, rok).
 * Platnost_do nastavuje signDpp() na make_date(rok,12,31).
 * dpp_stav rozšířeno o 'ukoncena' (D-F0013-10).
 */

export async function getOrCreateSmluvniStav(brigadnikId: string, rok: number) {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("smluvni_stav")
    .select("*")
    .eq("brigadnik_id", brigadnikId)
    .eq("rok", rok)
    .maybeSingle()

  if (existing) return existing

  const { data: created, error } = await supabase
    .from("smluvni_stav")
    .insert({ brigadnik_id: brigadnikId, rok })
    .select("*")
    .single()

  if (error) throw error
  return created
}

async function getCurrentInternalUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, internalUser: null }
  const { data: internalUser } = await supabase
    .from("users")
    .select("id, role, jmeno, prijmeni")
    .eq("auth_user_id", user.id)
    .single()
  return { user, internalUser }
}

type DppStav = "zadny" | "vygenerovano" | "odeslano" | "podepsano" | "ukoncena"
type ProhlaseniStav = "zadny" | "vygenerovano" | "odeslano" | "podepsano"

export async function updateDppStav(
  smluvniStavId: string,
  brigadnikId: string,
  stav: DppStav,
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
  stav: ProhlaseniStav,
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

// ---------------------------------------------------------------
// F-0013: signDpp / signProhlaseni / ukoncitDpp / autoUkoncit
// ---------------------------------------------------------------

/**
 * signDpp — přes per-rok signature, nastaví `podepsano` + `platnost_do` + audit
 * a volá auto-transition pipeline (D-F0013-03).
 */
export async function signDpp(
  brigadnikId: string,
  rok: number,
  dokumentId?: string
): Promise<
  | { success: true; transitioned?: boolean; transitioned_count?: number }
  | { error: string }
> {
  const parsed = signDppInputSchema.safeParse({ brigadnik_id: brigadnikId, rok, dokument_id: dokumentId })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  const { internalUser } = await getCurrentInternalUser()
  if (!internalUser) return { error: "Nepřihlášen" }

  const admin = createAdminClient()

  // OSVČ nesmí mít DPP
  const { data: brigadnik } = await admin
    .from("brigadnici")
    .select("typ_brigadnika")
    .eq("id", brigadnikId)
    .single()
  if (!brigadnik) return { error: "Brigádník nenalezen" }
  if (brigadnik.typ_brigadnika === "osvc") {
    return { error: "OSVČ nemůže mít DPP" }
  }

  // Ensure row exists
  const ss = await getOrCreateSmluvniStav(brigadnikId, rok)

  // Platnost_do = 31.12. roku
  const platnostDo = `${rok}-12-31`

  const { error } = await admin
    .from("smluvni_stav")
    .update({
      dpp_stav: "podepsano",
      dpp_podepsano_at: new Date().toISOString(),
      platnost_do: platnostDo,
      ...(dokumentId ? { dpp_podpis_dokument_id: dokumentId } : {}),
    })
    .eq("id", ss.id)

  if (error) return { error: error.message }

  await admin.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: internalUser.id,
    typ: "dpp_podpis",
    popis: `DPP ${rok} podepsáno (platnost do ${platnostDo})`,
    metadata: { rok, platnost_do: platnostDo },
  })

  const trans = await maybeAutoTransitionPipeline(brigadnikId, "dpp_podepsano")

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return {
    success: true,
    transitioned: trans.transitioned.length > 0,
    transitioned_count: trans.transitioned.length,
  }
}

/**
 * signProhlaseni — paralela k signDpp pro růžové prohlášení.
 * Platnost_do se (prozatím) neukládá pro prohlášení (D-F0013-11 sloučený platnost_do).
 */
export async function signProhlaseni(
  brigadnikId: string,
  rok: number,
  dokumentId?: string
): Promise<{ success: true } | { error: string }> {
  const parsed = signDppInputSchema.safeParse({ brigadnik_id: brigadnikId, rok, dokument_id: dokumentId })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  const { internalUser } = await getCurrentInternalUser()
  if (!internalUser) return { error: "Nepřihlášen" }

  const admin = createAdminClient()

  const { data: brigadnik } = await admin
    .from("brigadnici")
    .select("typ_brigadnika")
    .eq("id", brigadnikId)
    .single()
  if (!brigadnik) return { error: "Brigádník nenalezen" }
  if (brigadnik.typ_brigadnika === "osvc") {
    return { error: "OSVČ nemůže mít prohlášení" }
  }

  const ss = await getOrCreateSmluvniStav(brigadnikId, rok)

  const { error } = await admin
    .from("smluvni_stav")
    .update({
      prohlaseni_stav: "podepsano",
      prohlaseni_podepsano_at: new Date().toISOString(),
      ...(dokumentId ? { prohlaseni_podpis_dokument_id: dokumentId } : {}),
    })
    .eq("id", ss.id)

  if (error) return { error: error.message }

  await admin.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: internalUser.id,
    typ: "prohlaseni_podpis",
    popis: `Prohlášení ${rok} podepsáno`,
    metadata: { rok },
  })

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return { success: true }
}

/**
 * ukoncitDpp — manuální admin-only ukončení DPP (D-F0013-10).
 *  - dpp_stav → 'ukoncena', platnost_do může zůstat (audit zapisuje důvod).
 */
export async function ukoncitDpp(
  brigadnikId: string,
  rok: number,
  duvod?: string
): Promise<{ success: true } | { error: string }> {
  const parsed = ukoncitDppInputSchema.safeParse({ brigadnik_id: brigadnikId, rok, duvod })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  const { internalUser } = await getCurrentInternalUser()
  if (!internalUser) return { error: "Nepřihlášen" }
  if (internalUser.role !== "admin") return { error: "Nemáte oprávnění (admin only)" }

  const admin = createAdminClient()

  const { data: ss } = await admin
    .from("smluvni_stav")
    .select("id, dpp_stav")
    .eq("brigadnik_id", brigadnikId)
    .eq("rok", rok)
    .single()

  if (!ss) return { error: "Smluvní stav pro daný rok neexistuje" }
  if (ss.dpp_stav === "ukoncena") return { success: true }

  const { error } = await admin
    .from("smluvni_stav")
    .update({ dpp_stav: "ukoncena" })
    .eq("id", ss.id)

  if (error) return { error: error.message }

  await admin.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: internalUser.id,
    typ: "dpp_manual_ukoncena",
    popis: `DPP ${rok} manuálně ukončena${duvod ? `: ${duvod}` : ""}`,
    metadata: { rok, duvod: duvod ?? null },
  })

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return { success: true }
}

/**
 * autoUkoncitExpirovaneDpp — D-F0013-13 lazy batch.
 *  - Hledá podepsané DPP s `platnost_do < CURRENT_DATE` a flipne je na 'ukoncena'.
 *  - Volaný v dashboard loaderu (případně manuálně).
 *  - Idempotentní; druhé volání vrátí { ukonceno: 0 }.
 */
export async function autoUkoncitExpirovaneDpp(): Promise<{ ukonceno: number }> {
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: rows } = await admin
    .from("smluvni_stav")
    .select("id, brigadnik_id, rok")
    .eq("dpp_stav", "podepsano")
    .lt("platnost_do", today)

  const toUpdate = rows ?? []
  if (toUpdate.length === 0) return { ukonceno: 0 }

  const ids = toUpdate.map(r => r.id)
  const { error } = await admin
    .from("smluvni_stav")
    .update({ dpp_stav: "ukoncena" })
    .in("id", ids)

  if (error) {
    console.error("autoUkoncitExpirovaneDpp error:", error)
    return { ukonceno: 0 }
  }

  const historieRows = toUpdate.map(r => ({
    brigadnik_id: r.brigadnik_id,
    typ: "dpp_auto_ukoncena",
    popis: `DPP ${r.rok} automaticky ukončena (platnost_do < dnes)`,
    metadata: { rok: r.rok, auto: true },
  }))

  await admin.from("historie").insert(historieRows)

  return { ukonceno: toUpdate.length }
}
