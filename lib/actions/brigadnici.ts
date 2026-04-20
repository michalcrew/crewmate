"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { maybeEncryptDic } from "@/lib/utils/crypto"
import { z } from "zod"
import {
  updateBrigadnikTypSchema,
  updateBrigadnikOsvcFieldsSchema,
} from "@/lib/schemas/dotaznik"
import { maybeAutoTransitionPipeline } from "./pipeline"

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
    const s = filter.search.replace(/[%_,.()"'\\]/g, "")
    if (s.length > 0) {
      query = query.or(`jmeno.ilike.%${s}%,prijmeni.ilike.%${s}%,email.ilike.%${s}%,telefon.ilike.%${s}%`)
    }
  }

  const { data, error } = await query
  if (error) throw error

  try {
    const brigadnikIds = (data ?? []).map(b => b.id)
    if (brigadnikIds.length === 0) return data ?? []

    const { data: prirazeniData } = await supabase
      .from("prirazeni")
      .select("brigadnik_id")
      .in("brigadnik_id", brigadnikIds)
      .eq("status", "prirazeny")

    const actionCounts = new Map<string, number>()
    for (const p of prirazeniData ?? []) {
      actionCounts.set(p.brigadnik_id, (actionCounts.get(p.brigadnik_id) ?? 0) + 1)
    }

    // F-0013: per-rok smluvni_stav — aktuální rok + příští rok
    const currentYear = new Date().getFullYear()
    const nextYear = currentYear + 1

    const { data: smluvniData } = await supabase
      .from("smluvni_stav")
      .select("brigadnik_id, rok, dpp_stav")
      .in("brigadnik_id", brigadnikIds)
      .in("rok", [currentYear, nextYear])

    const dppMap = new Map<string, { current: string; next: string }>()
    for (const s of smluvniData ?? []) {
      const existing = dppMap.get(s.brigadnik_id) ?? { current: "zadny", next: "zadny" }
      if (s.rok === currentYear) existing.current = s.dpp_stav
      if (s.rok === nextYear) existing.next = s.dpp_stav
      dppMap.set(s.brigadnik_id, existing)
    }

    const enriched = (data ?? []).map(b => ({
      ...b,
      pocet_akci: actionCounts.get(b.id) ?? 0,
      dpp_tento_rok: dppMap.get(b.id)?.current ?? "zadny",
      dpp_pristi_rok: dppMap.get(b.id)?.next ?? "zadny",
    }))

    enriched.sort((a, b) => {
      if (b.pocet_akci !== a.pocet_akci) return b.pocet_akci - a.pocet_akci
      const ratingA = Number(a.prumerne_hodnoceni) || 0
      const ratingB = Number(b.prumerne_hodnoceni) || 0
      if (ratingB !== ratingA) return ratingB - ratingA
      return (a.prijmeni ?? "").localeCompare(b.prijmeni ?? "")
    })

    return enriched
  } catch {
    return (data ?? []).map(b => ({
      ...b,
      pocet_akci: 0,
      dpp_tento_rok: "zadny",
      dpp_pristi_rok: "zadny",
    }))
  }
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

/**
 * F-0013: rozšířený allowlist. Všechny sloupce kromě:
 *  - id, created_at, auth_user_id (nikdy)
 *  - rodne_cislo, cislo_op (dedicated encrypted flow — submitDotaznik)
 *  - typ_brigadnika (separate action updateBrigadnikTyp — admin only)
 *  - osvc_dic (mixed-encryption dle D-17 — separate updateBrigadnikOsvcFields)
 *
 * Per D-F0013-15: 1 audit entry per volání s metadata.changed_fields + diffs.
 * Encrypted-field diffs maskují hodnoty jako "<zmena>".
 */
const UPDATE_BRIGADNIK_ALLOWLIST = [
  "jmeno",
  "prijmeni",
  "email",
  "telefon",
  "datum_narozeni",
  "misto_narozeni",
  "rodne_jmeno",
  "rodne_prijmeni",
  "ulice_cp",
  "psc",
  "mesto_bydliste",
  "zeme",
  "adresa",
  "korespondencni_adresa",
  "cislo_uctu",
  "kod_banky",
  "zdravotni_pojistovna",
  "vzdelani",
  "narodnost",
  "chce_ruzove_prohlaseni",
  "osvc_ico",
  "osvc_fakturacni_adresa",
  "poznamky",
  "aktivni",
  "zdroj",
] as const

type UpdateBrigadnikField = typeof UPDATE_BRIGADNIK_ALLOWLIST[number]

export async function updateBrigadnik(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries()) as Record<string, FormDataEntryValue>

  // Load current state for diff
  const { data: current } = await supabase
    .from("brigadnici")
    .select("*")
    .eq("id", id)
    .single()

  if (!current) return { error: "Brigádník nenalezen" }

  const update: Record<string, unknown> = {}
  const diffs: Record<string, { old: unknown; new: unknown }> = {}
  const changedFields: string[] = []

  for (const field of UPDATE_BRIGADNIK_ALLOWLIST) {
    if (!(field in raw)) continue
    const rawVal = raw[field]

    let newVal: unknown
    if (field === "chce_ruzove_prohlaseni" || field === "aktivni") {
      newVal = rawVal === "on" || rawVal === "true"
    } else if (typeof rawVal === "string") {
      newVal = rawVal === "" ? null : rawVal
    } else {
      newVal = rawVal
    }

    const oldVal = (current as Record<string, unknown>)[field] ?? null
    if (newVal !== oldVal && !(oldVal == null && newVal == null)) {
      update[field] = newVal
      diffs[field] = { old: oldVal, new: newVal }
      changedFields.push(field)
    }
  }

  if (changedFields.length === 0) {
    return { success: true }
  }

  const { error } = await supabase
    .from("brigadnici")
    .update(update)
    .eq("id", id)

  if (error) return { error: error.message }

  // Audit log: D-F0013-15 single entry per call
  const { data: internalUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  await supabase.from("historie").insert({
    brigadnik_id: id,
    user_id: internalUser?.id,
    typ: "brigadnik_osobni_udaje_change",
    popis: `Změna osobních údajů: ${changedFields.length} pole`,
    metadata: { changed_fields: changedFields, diffs },
  })

  revalidatePath(`/app/brigadnici/${id}`)
  revalidatePath("/app/brigadnici")
  return { success: true }
}

/**
 * F-0013 D-F0013-16: `updateBrigadnikTyp` — ADMIN ONLY.
 *  - Přepíná typ_brigadnika (brigadnik ↔ osvc)
 *  - OSVČ data zůstávají v DB při přepnutí zpět (US-1B-3).
 *  - Auto-transition NH→VV spouští jen při nastavení na 'osvc'.
 */
export async function updateBrigadnikTyp(
  brigadnikId: string,
  typ: "brigadnik" | "osvc"
): Promise<{ success: true; transitioned?: number } | { error: string }> {
  const parsed = updateBrigadnikTypSchema.safeParse({ brigadnik_id: brigadnikId, typ })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { data: internalUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single()

  if (!internalUser) return { error: "Nepřihlášen" }
  if (internalUser.role !== "admin") return { error: "Nemáte oprávnění (admin only)" }

  const admin = createAdminClient()

  const { data: current } = await admin
    .from("brigadnici")
    .select("typ_brigadnika, osvc_ico, osvc_fakturacni_adresa")
    .eq("id", brigadnikId)
    .single()

  if (!current) return { error: "Brigádník nenalezen" }
  if (current.typ_brigadnika === typ) return { success: true }

  // Při přepnutí na OSVČ kontrola DB constraint (ICO required)
  if (typ === "osvc" && !current.osvc_ico) {
    return { error: "Pro OSVČ je nutné nejdřív vyplnit IČO (přes updateBrigadnikOsvcFields)" }
  }

  const { error } = await admin
    .from("brigadnici")
    .update({ typ_brigadnika: typ })
    .eq("id", brigadnikId)

  if (error) return { error: error.message }

  await admin.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: internalUser.id,
    typ: "brigadnik_typ_zmena",
    popis: `Změna typu brigádníka: ${current.typ_brigadnika} → ${typ}`,
    metadata: { before: current.typ_brigadnika, after: typ },
  })

  let transitioned = 0
  if (typ === "osvc") {
    const trans = await maybeAutoTransitionPipeline(brigadnikId, "osvc_flag")
    transitioned = trans.transitioned.length
  }

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  revalidatePath("/app/brigadnici")
  return { success: true, transitioned }
}

/**
 * F-0013: updateBrigadnikOsvcFields
 *  - Updatuje OSVČ fakturační údaje (ico, dic, adresa).
 *  - DIČ mixed-encryption (D-17 security override):
 *      - FO (CZ + 10 číslic, číselná část = RČ) → `encrypt()` přes AES-256-GCM
 *      - PO (CZ + 8–9 číslic, číselná část = IČO) → plain (IČO je veřejný přes ARES)
 *    Encapsulated v `maybeEncryptDic()` v `lib/utils/crypto.ts`.
 *  - Jeden audit entry s diff metadatou (DIČ diff je VŽDY maskovaný jako `<zmeneno>`
 *    bez ohledu na FO/PO — konzistence + no accidental plaintext log regrese).
 */
export async function updateBrigadnikOsvcFields(
  brigadnikId: string,
  fields: {
    osvc_ico?: string
    osvc_dic?: string
    osvc_fakturacni_adresa?: string
  }
): Promise<{ success: true } | { error: string }> {
  const parsed = updateBrigadnikOsvcFieldsSchema.safeParse({
    brigadnik_id: brigadnikId,
    ...fields,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from("brigadnici")
    .select("osvc_ico, osvc_dic, osvc_fakturacni_adresa")
    .eq("id", brigadnikId)
    .single()

  if (!current) return { error: "Brigádník nenalezen" }

  const update: Record<string, unknown> = {}
  const diffs: Record<string, { old: unknown; new: unknown }> = {}
  const changed: string[] = []

  if (parsed.data.osvc_ico !== undefined && parsed.data.osvc_ico !== current.osvc_ico) {
    update.osvc_ico = parsed.data.osvc_ico
    diffs.osvc_ico = { old: current.osvc_ico, new: parsed.data.osvc_ico }
    changed.push("osvc_ico")
  }

  if (parsed.data.osvc_dic !== undefined) {
    // D-17 (security override): šifrovat POUZE FO DIČ (CZ + 10 číslic).
    // PO DIČ (CZ + 8–9 číslic = IČO-based) zůstává plain — je veřejný přes ARES.
    // Viz `maybeEncryptDic` v `lib/utils/crypto.ts`.
    update.osvc_dic = maybeEncryptDic(parsed.data.osvc_dic)
    if (current.osvc_dic !== update.osvc_dic) {
      // Mask v diffs — never log plaintext (platí i pro plain PO DIČ pro konzistenci)
      diffs.osvc_dic = { old: current.osvc_dic ? "<zmeneno>" : null, new: parsed.data.osvc_dic ? "<zmeneno>" : null }
      changed.push("osvc_dic")
    }
  }

  if (
    parsed.data.osvc_fakturacni_adresa !== undefined
    && parsed.data.osvc_fakturacni_adresa !== current.osvc_fakturacni_adresa
  ) {
    update.osvc_fakturacni_adresa = parsed.data.osvc_fakturacni_adresa
    diffs.osvc_fakturacni_adresa = { old: current.osvc_fakturacni_adresa, new: parsed.data.osvc_fakturacni_adresa }
    changed.push("osvc_fakturacni_adresa")
  }

  if (changed.length === 0) return { success: true }

  const { error } = await admin
    .from("brigadnici")
    .update(update)
    .eq("id", brigadnikId)

  if (error) return { error: error.message }

  const { data: internalUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  await admin.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: internalUser?.id,
    typ: "brigadnik_osvc_field_zmena",
    popis: `Změna OSVČ údajů: ${changed.length} pole`,
    metadata: { changed_fields: changed, diffs },
  })

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return { success: true }
}

export async function createBrigadnikAndAddToPipeline(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = brigadnikSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  const nabidkaId = raw.nabidka_id as string
  if (!nabidkaId) return { error: "Chybí ID nabídky" }

  const { data: existing } = await supabase
    .from("brigadnici")
    .select("id")
    .eq("email", parsed.data.email)
    .limit(1)

  let brigadnikId: string

  if (existing && existing.length > 0 && existing[0]) {
    brigadnikId = existing[0].id
  } else {
    const { data: newB, error: insertError } = await supabase
      .from("brigadnici")
      .insert({
        jmeno: parsed.data.jmeno,
        prijmeni: parsed.data.prijmeni,
        email: parsed.data.email,
        telefon: parsed.data.telefon,
        zdroj: "rucne",
      })
      .select("id")
      .single()

    if (insertError || !newB) return { error: "Nepodařilo se vytvořit brigádníka" }
    brigadnikId = newB.id
  }

  const { error: pipelineError } = await supabase
    .from("pipeline_entries")
    .insert({
      brigadnik_id: brigadnikId,
      nabidka_id: nabidkaId,
      stav: "kontaktovan",
    })

  if (pipelineError) {
    if (pipelineError.code === "23505") return { error: "Brigádník je již v pipeline této nabídky" }
    return { error: pipelineError.message }
  }

  const { data: internalUser } = await supabase
    .from("users").select("id").eq("auth_user_id", user.id).single()

  await supabase.from("historie").insert({
    brigadnik_id: brigadnikId,
    nabidka_id: nabidkaId,
    user_id: internalUser?.id,
    typ: "pipeline_zmena",
    popis: `Ručně přidán: ${parsed.data.jmeno} ${parsed.data.prijmeni} (telefon)`,
  })

  revalidatePath(`/app/nabidky/${nabidkaId}`)
  revalidatePath("/app/brigadnici")
  return { success: true, id: brigadnikId }
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

/**
 * F-0013: per-rok smluvni_stav. Orderováno DESC podle `rok`.
 */
export async function getBrigadnikSmluvniStav(brigadnikId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("smluvni_stav")
    .select("*")
    .eq("brigadnik_id", brigadnikId)
    .order("rok", { ascending: false })

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
