"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import { createHash } from "crypto"
import { verifyPin as checkPin } from "@/lib/utils/pin"

// Simple in-memory rate limiting (per process — sufficient for serverless)
const pinAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string, maxAttempts: number = 5, windowMs: number = 60000): boolean {
  const now = Date.now()
  const entry = pinAttempts.get(key)
  if (!entry || now > entry.resetAt) {
    pinAttempts.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count++
  return entry.count <= maxAttempts
}

// F-0018: Token fingerprint pro koordinator editor_id (stabilní per akce+pin, neloggujeme PIN samotný)
function koordinatorFingerprint(pin: string, akceId: string): string {
  return createHash("sha256").update(`${pin}:${akceId}`).digest("hex").slice(0, 16)
}

export async function verifyPin(akceId: string, pin: string) {
  // Rate limit: 5 attempts per minute per akce
  if (!checkRateLimit(`pin:${akceId}`)) {
    return { error: "Příliš mnoho pokusů. Zkuste to za minutu." }
  }

  const supabase = createAdminClient()
  const { data } = await supabase
    .from("akce")
    .select("id, nazev, datum, cas_od, cas_do, misto, pin_kod, pin_hash")
    .eq("id", akceId)
    .single()

  const pinOk = data
    ? await checkPin(pin, { pin_hash: data.pin_hash, pin_kod: data.pin_kod })
    : false
  if (!data || !pinOk) {
    return { error: "Neplatný PIN" }
  }

  return { success: true, akce: { id: data.id, nazev: data.nazev, datum: data.datum, cas_od: data.cas_od, cas_do: data.cas_do, misto: data.misto } }
}

export async function getDochazkaByAkce(akceId: string, pin: string) {
  // Verify PIN before returning data
  const supabase = createAdminClient()
  const { data: akce } = await supabase
    .from("akce")
    .select("pin_kod, pin_hash")
    .eq("id", akceId)
    .single()

  const pinOk = akce
    ? await checkPin(pin, { pin_hash: akce.pin_hash, pin_kod: akce.pin_kod })
    : false
  if (!akce || !pinOk) {
    return []
  }

  const { data } = await supabase
    .from("prirazeni")
    .select(`
      id,
      brigadnik:brigadnici(id, jmeno, prijmeni),
      pozice,
      status,
      dochazka(id, prichod, odchod, hodin_celkem, hodnoceni, poznamka)
    `)
    .eq("akce_id", akceId)
    .eq("status", "prirazeny")
    .order("created_at", { ascending: true })

  return data ?? []
}

// F-0020 cleanup: legacy `saveDochazka` smazán — nahrazeno F-0018 `upsertDochazkaField`.

async function autoLogInternalExperience(
  brigadnikId: string,
  akceId: string,
  supabase: ReturnType<typeof createAdminClient>
) {
  // Check if already logged for this akce
  const { data: existing } = await supabase
    .from("pracovni_zkusenosti")
    .select("id")
    .eq("brigadnik_id", brigadnikId)
    .eq("akce_id", akceId)
    .limit(1)

  if (existing && existing.length > 0) return

  // Get akce details + prirazeni position
  const { data: akce } = await supabase
    .from("akce")
    .select("nazev, datum, misto, klient")
    .eq("id", akceId)
    .single()

  const { data: prirazeni } = await supabase
    .from("prirazeni")
    .select("pozice")
    .eq("akce_id", akceId)
    .eq("brigadnik_id", brigadnikId)
    .single()

  if (!akce) return

  const pozice = prirazeni?.pozice || akce.nazev
  const popis = [akce.klient, akce.misto].filter(Boolean).join(", ")

  await supabase.from("pracovni_zkusenosti").insert({
    brigadnik_id: brigadnikId,
    pozice,
    popis: popis || null,
    typ: "interni",
    zdroj: "interni",
    datum_od: akce.datum,
    datum_do: akce.datum,
    akce_id: akceId,
  })
}

// F-0020 cleanup: legacy `saveDochazkaAuth` smazán — nahrazeno F-0018 `upsertDochazkaField`.

// ============================================================================
// F-0018 Docházka scale + admin
// ============================================================================

export type DochazkaField = "prichod" | "odchod" | "hodnoceni" | "poznamka"
export type DochazkaEditor =
  | { type: "admin"; id: string; pin?: never }   // id = users.id (interní UUID)
  | { type: "koordinator"; id?: never; pin: string }  // pin → fingerprint

type UpsertFieldResult =
  | { success: true; serverValue: string | number | null }
  | { error: string }

const FIELD_VALIDATORS = {
  prichod: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Neplatný čas").nullable(),
  odchod: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Neplatný čas").nullable(),
  hodnoceni: z.coerce.number().int().min(1).max(5).nullable(),
  poznamka: z.string().max(500, "Poznámka max 500 znaků").nullable(),
} as const

/**
 * User feedback 22.4.: čas příchod/odchod se automaticky zaokrouhlí
 * matematicky na 15 minut (half-up na nearest čtvrthodinu).
 *  7:07 → 7:00
 *  7:08 → 7:15
 *  7:22 → 7:15
 *  7:23 → 7:30
 *  7:52 → 7:45
 *  7:53 → 8:00
 *  23:53 → 24:00 → wrap na 23:45 (aby nepřetekla 23:59; edge case).
 */
function roundTimeTo15(raw: string): string {
  const m = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/)
  if (!m) return raw
  const hh = Number(m[1])
  const mm = Number(m[2])
  const totalMin = hh * 60 + mm
  const rounded = Math.round(totalMin / 15) * 15
  // Clamp na [0, 23:45] — 24:00 není validní time
  const clamped = Math.min(rounded, 23 * 60 + 45)
  const rh = Math.floor(clamped / 60)
  const rm = clamped % 60
  return `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}`
}

function validateFieldValue(field: DochazkaField, value: unknown): { ok: true; value: string | number | null } | { ok: false; error: string } {
  const normalized = value === "" || value === undefined ? null : value
  const schema = FIELD_VALIDATORS[field]
  const parsed = schema.safeParse(normalized)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neplatná hodnota" }
  }
  let cleanValue = parsed.data as string | number | null
  // Zaokrouhlení jen pro time fields (prichod/odchod) a jen pokud není NULL.
  if ((field === "prichod" || field === "odchod") && typeof cleanValue === "string") {
    cleanValue = roundTimeTo15(cleanValue)
  }
  return { ok: true, value: cleanValue }
}

/**
 * F-0018: Atomic per-field upsert do `dochazka` (jen daný field, ostatní zůstávají).
 * Audit soft-merge 5min window per (prirazeni, field, editor).
 * autoLogInternalExperience se volá jen když po upsertu má záznam `prichod && odchod`
 * a jen u field='prichod'|'odchod' (hodnoceni/poznamka to nespustí).
 */
export async function upsertDochazkaField(
  prirazeniId: string,
  field: DochazkaField,
  value: string | number | null,
  editor: DochazkaEditor
): Promise<UpsertFieldResult> {
  // 1. Validace field + value
  const validation = validateFieldValue(field, value)
  if (!validation.ok) return { error: validation.error }
  const cleanValue = validation.value

  // 2. Rate limit per editor
  let editorId: string
  let editorType: "admin" | "koordinator"
  if (editor.type === "admin") {
    editorId = editor.id
    editorType = "admin"
    if (!checkRateLimit(`save:admin:${editorId}`, 120, 60_000)) {
      return { error: "Příliš mnoho zápisů. Zkuste to za chvíli." }
    }
  } else {
    editorType = "koordinator"
    editorId = "" // vyplníme až po PIN verify (akceId známe)
    // rate limit podle PIN+pid klíče doplníme níže, až budeme mít akceId
  }

  const supabase = createAdminClient()

  // 3. Zjisti prirazeni → akce_id, brigadnik_id, pin_kod, pin_hash (F-0021b)
  const { data: prir } = await supabase
    .from("prirazeni")
    .select("id, akce_id, brigadnik_id, akce:akce(pin_kod, pin_hash)")
    .eq("id", prirazeniId)
    .single()

  if (!prir) return { error: "Přiřazení nenalezeno" }

  const akceId = prir.akce_id as string
  const brigadnikId = prir.brigadnik_id as string
  const akceData = ((prir.akce as unknown) as { pin_kod: string | null; pin_hash: string | null } | null)

  // 4. PIN verify + rate limit pro koordinátora
  if (editor.type === "koordinator") {
    const pinOk = await checkPin(editor.pin, {
      pin_hash: akceData?.pin_hash ?? null,
      pin_kod: akceData?.pin_kod ?? null,
    })
    if (!pinOk) return { error: "Neplatný PIN" }
    editorId = koordinatorFingerprint(editor.pin, akceId)
    if (!checkRateLimit(`save:koord:${editorId}`, 60, 60_000)) {
      return { error: "Příliš mnoho zápisů. Zkuste to za chvíli." }
    }
  }

  // 5. Načti existující dochazka (pro oldVal do auditu + rozhodnutí update vs. insert)
  const { data: existing } = await supabase
    .from("dochazka")
    .select("id, prichod, odchod, hodnoceni, poznamka")
    .eq("prirazeni_id", prirazeniId)
    .maybeSingle()

  const oldValue =
    existing
      ? (existing as Record<string, unknown>)[field] ?? null
      : null

  // 6. Upsert jen field
  if (existing) {
    const { error: updErr } = await supabase
      .from("dochazka")
      .update({ [field]: cleanValue })
      .eq("id", existing.id)
    if (updErr) return { error: "Nepodařilo se uložit" }
  } else {
    const insertRow: Record<string, unknown> = {
      prirazeni_id: prirazeniId,
      akce_id: akceId,
      brigadnik_id: brigadnikId,
      prichod: null,
      odchod: null,
      hodnoceni: null,
      poznamka: null,
    }
    insertRow[field] = cleanValue
    const { error: insErr } = await supabase.from("dochazka").insert(insertRow)
    if (insErr) return { error: "Nepodařilo se uložit" }
  }

  // 7. Audit soft-merge (5min window)
  await auditUpsertFieldChange(supabase, {
    brigadnikId,
    akceId,
    prirazeniId,
    field,
    oldValue,
    newValue: cleanValue,
    editorType,
    editorId,
  })

  // 8. Auto-log internal experience když prichod && odchod — jen při zápisu prichod/odchod
  if (field === "prichod" || field === "odchod") {
    const finalPrichod = field === "prichod" ? cleanValue : existing?.prichod ?? null
    const finalOdchod = field === "odchod" ? cleanValue : existing?.odchod ?? null
    if (finalPrichod && finalOdchod) {
      autoLogInternalExperience(brigadnikId, akceId, supabase).catch((err) =>
        console.error("Auto-log experience error:", err)
      )
    }
  }

  return { success: true, serverValue: cleanValue }
}

/**
 * F-0018 audit soft-merge.
 * 5min sliding window per (prirazeni, field, editor_id) → UPDATE metadata, jinak INSERT.
 */
async function auditUpsertFieldChange(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    brigadnikId: string
    akceId: string
    prirazeniId: string
    field: DochazkaField
    oldValue: unknown
    newValue: string | number | null
    editorType: "admin" | "koordinator"
    editorId: string
  }
) {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data: recent } = await supabase
    .from("historie")
    .select("id, metadata")
    .eq("typ", "dochazka_zapis_f0018")
    .eq("brigadnik_id", params.brigadnikId)
    .eq("akce_id", params.akceId)
    .contains("metadata", {
      prirazeni_id: params.prirazeniId,
      field: params.field,
      editor_id: params.editorId,
    })
    .gt("created_at", fiveMinAgo)
    .order("created_at", { ascending: false })
    .limit(1)

  if (recent && recent.length > 0) {
    const row = recent[0] as { id: string; metadata: Record<string, unknown> | null }
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    const count = typeof meta.count === "number" ? meta.count : 1
    const newMeta = {
      ...meta,
      last_value: params.newValue,
      new_value: params.newValue,
      count: count + 1,
    }
    await supabase
      .from("historie")
      .update({
        metadata: newMeta,
        popis: `${params.field}: → ${String(params.newValue ?? "—")} (×${count + 1})`,
      })
      .eq("id", row.id)
    return
  }

  await supabase.from("historie").insert({
    brigadnik_id: params.brigadnikId,
    akce_id: params.akceId,
    typ: "dochazka_zapis_f0018",
    popis: `${params.field}: ${String(params.oldValue ?? "—")} → ${String(params.newValue ?? "—")}`,
    metadata: {
      prirazeni_id: params.prirazeniId,
      field: params.field,
      old_value: params.oldValue,
      new_value: params.newValue,
      last_value: params.newValue,
      editor_type: params.editorType,
      editor_id: params.editorId,
      count: 1,
    },
  })
}

/**
 * F-0018: Označ brigádníka jako "nepřišel" (status → vypadl).
 * Guard: odmítnout pokud dochazka.prichod IS NOT NULL.
 */
export async function markNepriselBrigadnik(
  prirazeniId: string,
  editor: DochazkaEditor
): Promise<{ success: true } | { error: string }> {
  // Rate limit (per editor) — lehčí limit 20 req/min
  const rlKey = editor.type === "admin" ? `neprisel:admin:${editor.id}` : `neprisel:koord:${prirazeniId}`
  if (!checkRateLimit(rlKey, 20, 60_000)) {
    return { error: "Příliš mnoho pokusů. Zkuste to za chvíli." }
  }

  const supabase = createAdminClient()

  const { data: prir } = await supabase
    .from("prirazeni")
    .select("id, akce_id, brigadnik_id, status, akce:akce(pin_kod, pin_hash)")
    .eq("id", prirazeniId)
    .single()
  if (!prir) return { error: "Přiřazení nenalezeno" }

  const akceId = prir.akce_id as string
  const brigadnikId = prir.brigadnik_id as string
  const akceData = ((prir.akce as unknown) as { pin_kod: string | null; pin_hash: string | null } | null)

  // Koordinator PIN check
  let editorId: string
  if (editor.type === "admin") {
    editorId = editor.id
  } else {
    const pinOk = await checkPin(editor.pin, {
      pin_hash: akceData?.pin_hash ?? null,
      pin_kod: akceData?.pin_kod ?? null,
    })
    if (!pinOk) return { error: "Neplatný PIN" }
    editorId = koordinatorFingerprint(editor.pin, akceId)
  }

  // User feedback 22.4.: guard na existující příchod odstraněn.
  // Koordinátor často omylem zapíše příchod brigádníkovi, který ale
  // reálně nedorazil. Musí to jít opravit.
  // Pokud existuje dochazka řádek s vyplněným časem, vynulujeme ho
  // (aby se zabránilo fantom-dochazce pro "vypadl" status).
  const { data: existingDoch } = await supabase
    .from("dochazka")
    .select("id, prichod, odchod, hodnoceni, poznamka")
    .eq("prirazeni_id", prirazeniId)
    .maybeSingle()

  if (existingDoch) {
    await supabase
      .from("dochazka")
      .update({ prichod: null, odchod: null, hodin_celkem: null })
      .eq("id", existingDoch.id)
  }

  // Update status
  const { error } = await supabase
    .from("prirazeni")
    .update({ status: "vypadl" })
    .eq("id", prirazeniId)
  if (error) return { error: "Nepodařilo se uložit" }

  await supabase.from("historie").insert({
    brigadnik_id: brigadnikId,
    akce_id: akceId,
    typ: "prirazeni_neprisel",
    popis: existingDoch && (existingDoch.prichod || existingDoch.odchod)
      ? `Brigádník nepřišel (předchozí časy vymazány: příchod=${existingDoch.prichod ?? "—"}, odchod=${existingDoch.odchod ?? "—"})`
      : "Brigádník nepřišel na akci",
    metadata: {
      prirazeni_id: prirazeniId,
      editor_type: editor.type,
      editor_id: editorId,
      previous_status: prir.status,
      cleared_prichod: existingDoch?.prichod ?? null,
      cleared_odchod: existingDoch?.odchod ?? null,
    },
  })

  return { success: true }
}

/**
 * F-0018: Zruš označení "nepřišel" (status vypadl → prirazeny).
 */
export async function undoNepriselBrigadnik(
  prirazeniId: string,
  editor: DochazkaEditor
): Promise<{ success: true } | { error: string }> {
  const rlKey = editor.type === "admin" ? `neprisel_undo:admin:${editor.id}` : `neprisel_undo:koord:${prirazeniId}`
  if (!checkRateLimit(rlKey, 20, 60_000)) {
    return { error: "Příliš mnoho pokusů. Zkuste to za chvíli." }
  }

  const supabase = createAdminClient()

  const { data: prir } = await supabase
    .from("prirazeni")
    .select("id, akce_id, brigadnik_id, status, akce:akce(pin_kod, pin_hash)")
    .eq("id", prirazeniId)
    .single()
  if (!prir) return { error: "Přiřazení nenalezeno" }

  if (prir.status !== "vypadl") {
    return { error: "Brigádník není označen jako „nepřišel\"" }
  }

  const akceId = prir.akce_id as string
  const brigadnikId = prir.brigadnik_id as string
  const akceData = ((prir.akce as unknown) as { pin_kod: string | null; pin_hash: string | null } | null)

  let editorId: string
  if (editor.type === "admin") {
    editorId = editor.id
  } else {
    const pinOk = await checkPin(editor.pin, {
      pin_hash: akceData?.pin_hash ?? null,
      pin_kod: akceData?.pin_kod ?? null,
    })
    if (!pinOk) return { error: "Neplatný PIN" }
    editorId = koordinatorFingerprint(editor.pin, akceId)
  }

  const { error } = await supabase
    .from("prirazeni")
    .update({ status: "prirazeny" })
    .eq("id", prirazeniId)
  if (error) return { error: "Nepodařilo se uložit" }

  await supabase.from("historie").insert({
    brigadnik_id: brigadnikId,
    akce_id: akceId,
    typ: "prirazeni_neprisel_undo",
    popis: "Zrušeno označení „nepřišel\"",
    metadata: {
      prirazeni_id: prirazeniId,
      editor_type: editor.type,
      editor_id: editorId,
    },
  })

  return { success: true }
}

/**
 * F-0018: Admin/náborářka načte kompletní docházku pro akci včetně všech brigádníků
 * (i těch se status='vypadl') + dokumentační stav z v_brigadnik_zakazka_status.
 */
export async function getAkceDochazkaForAdmin(akceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" as const }

  const admin = createAdminClient()

  // Role check — MD-1 fallback pattern: RLS může při stale session vrátit null
  // pro vlastní users řádek → naborářka by skončila na redirect. Zkusíme
  // user-session client a pak admin client jako fallback.
  let internalUser: { id: string; role: string } | null = null
  {
    const { data: viaSession } = await supabase
      .from("users")
      .select("id, role")
      .eq("auth_user_id", user.id)
      .single()
    if (viaSession) internalUser = viaSession as { id: string; role: string }
    else {
      const { data: viaAdmin } = await admin
        .from("users")
        .select("id, role")
        .eq("auth_user_id", user.id)
        .single()
      if (viaAdmin) internalUser = viaAdmin as { id: string; role: string }
    }
  }
  if (!internalUser || !["admin", "naborar"].includes(internalUser.role)) {
    return { error: "Nemáte oprávnění" as const }
  }

  const { data: akce } = await admin
    .from("akce")
    .select("id, nazev, datum, cas_od, cas_do, misto, stav, nabidka_id")
    .eq("id", akceId)
    .single()
  if (!akce) return { error: "Akce nenalezena" as const }

  const { data: entries } = await admin
    .from("prirazeni")
    .select(`
      id, akce_id, brigadnik_id, pozice, status, poradi_nahradnik,
      brigadnik:brigadnici(id, jmeno, prijmeni, typ_brigadnika),
      dochazka(id, prichod, odchod, hodin_celkem, hodnoceni, poznamka)
    `)
    .eq("akce_id", akceId)
    .order("created_at", { ascending: true })

  // Dokumentační status (v_brigadnik_zakazka_status) per brigadnik × nabidka akce
  let docStatusMap = new Map<string, string>()
  if (akce.nabidka_id && entries && entries.length > 0) {
    const brigadnikIds = entries.map((e) => e.brigadnik_id as string)
    const { data: statuses } = await admin
      .from("v_brigadnik_zakazka_status")
      .select("brigadnik_id, dokumentacni_stav")
      .eq("nabidka_id", akce.nabidka_id)
      .in("brigadnik_id", brigadnikIds)
    if (statuses) {
      docStatusMap = new Map(
        statuses.map((s) => [s.brigadnik_id as string, s.dokumentacni_stav as string])
      )
    }
  }

  const enriched = (entries ?? []).map((e) => ({
    ...e,
    dokumentacni_stav: docStatusMap.get(e.brigadnik_id as string) ?? "nevyplnene_udaje",
  }))

  return {
    success: true as const,
    akce,
    entries: enriched,
    internalUserId: internalUser.id,
  }
}

/**
 * F-0018 — Koordinátor (PIN) verze loaderu: vrací brigádníka s telefonem + všechny statusy
 * (včetně `vypadl` kvůli undo buttonu) + dokumentacni_stav z `v_brigadnik_zakazka_status`.
 */
export async function getKoordinatorDochazka(akceId: string, pin: string) {
  const supabase = createAdminClient()
  const { data: akce } = await supabase
    .from("akce")
    .select("id, nazev, datum, cas_od, cas_do, misto, stav, nabidka_id, pin_kod, pin_hash")
    .eq("id", akceId)
    .single()

  const pinOk = akce
    ? await checkPin(pin, { pin_hash: akce.pin_hash, pin_kod: akce.pin_kod })
    : false
  if (!akce || !pinOk) {
    return { error: "Neplatný PIN" as const }
  }

  const { data: entries } = await supabase
    .from("prirazeni")
    .select(`
      id, akce_id, brigadnik_id, pozice, status, poradi_nahradnik,
      brigadnik:brigadnici(id, jmeno, prijmeni, telefon),
      dochazka(id, prichod, odchod, hodin_celkem, hodnoceni, poznamka)
    `)
    .eq("akce_id", akceId)
    .order("created_at", { ascending: true })

  let docStatusMap = new Map<string, string>()
  if (akce.nabidka_id && entries && entries.length > 0) {
    const brigadnikIds = entries.map((e) => e.brigadnik_id as string)
    const { data: statuses } = await supabase
      .from("v_brigadnik_zakazka_status")
      .select("brigadnik_id, dokumentacni_stav")
      .eq("nabidka_id", akce.nabidka_id)
      .in("brigadnik_id", brigadnikIds)
    if (statuses) {
      docStatusMap = new Map(
        statuses.map((s) => [s.brigadnik_id as string, s.dokumentacni_stav as string]),
      )
    }
  }

  const enriched = (entries ?? []).map((e) => ({
    ...e,
    dokumentacni_stav: docStatusMap.get(e.brigadnik_id as string) ?? "nevyplnene_udaje",
  }))

  return {
    success: true as const,
    akce: {
      id: akce.id,
      nazev: akce.nazev,
      datum: akce.datum,
      cas_od: akce.cas_od,
      cas_do: akce.cas_do,
      misto: akce.misto,
      stav: akce.stav,
    },
    entries: enriched,
  }
}
