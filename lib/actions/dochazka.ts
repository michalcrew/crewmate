"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import { createHash } from "crypto"

const dochazkaSchema = z.object({
  prirazeni_id: z.string().uuid(),
  akce_id: z.string().uuid(),
  brigadnik_id: z.string().uuid(),
  pin: z.string().min(1, "PIN je povinný"),
  prichod: z.string().optional(),
  odchod: z.string().optional(),
  hodnoceni: z.coerce.number().int().min(1).max(5).optional(),
  poznamka: z.string().optional(),
})

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
    .select("id, nazev, datum, cas_od, cas_do, misto, pin_kod")
    .eq("id", akceId)
    .single()

  if (!data || data.pin_kod !== pin) {
    return { error: "Neplatný PIN" }
  }

  return { success: true, akce: { id: data.id, nazev: data.nazev, datum: data.datum, cas_od: data.cas_od, cas_do: data.cas_do, misto: data.misto } }
}

export async function getDochazkaByAkce(akceId: string, pin: string) {
  // Verify PIN before returning data
  const supabase = createAdminClient()
  const { data: akce } = await supabase
    .from("akce")
    .select("pin_kod")
    .eq("id", akceId)
    .single()

  if (!akce || akce.pin_kod !== pin) {
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

export async function saveDochazka(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  const parsed = dochazkaSchema.safeParse(raw)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  // Verify PIN before saving
  const supabase = createAdminClient()
  const { data: akce } = await supabase
    .from("akce")
    .select("pin_kod")
    .eq("id", parsed.data.akce_id)
    .single()

  if (!akce || akce.pin_kod !== parsed.data.pin) {
    return { error: "Neplatný PIN" }
  }

  // Upsert — update if exists, insert if not
  const { data: existing } = await supabase
    .from("dochazka")
    .select("id")
    .eq("prirazeni_id", parsed.data.prirazeni_id)
    .single()

  const dochazkaData = {
    prichod: parsed.data.prichod || null,
    odchod: parsed.data.odchod || null,
    hodnoceni: parsed.data.hodnoceni || null,
    poznamka: parsed.data.poznamka || null,
  }

  if (existing) {
    const { error } = await supabase
      .from("dochazka")
      .update(dochazkaData)
      .eq("id", existing.id)

    if (error) return { error: "Nepodařilo se uložit docházku" }
  } else {
    const { error } = await supabase
      .from("dochazka")
      .insert({
        prirazeni_id: parsed.data.prirazeni_id,
        akce_id: parsed.data.akce_id,
        brigadnik_id: parsed.data.brigadnik_id,
        ...dochazkaData,
      })

    if (error) return { error: "Nepodařilo se uložit docházku" }
  }

  // Audit log for attendance
  await supabase.from("historie").insert({
    brigadnik_id: parsed.data.brigadnik_id,
    akce_id: parsed.data.akce_id,
    typ: "dochazka_zapsana",
    popis: `Docházka: ${dochazkaData.prichod ?? "—"} – ${dochazkaData.odchod ?? "—"}${dochazkaData.hodnoceni ? `, hodnocení ${dochazkaData.hodnoceni}/5` : ""}`,
  })

  // Auto-create internal work experience when shift is completed (has both prichod + odchod)
  if (dochazkaData.prichod && dochazkaData.odchod) {
    autoLogInternalExperience(
      parsed.data.brigadnik_id,
      parsed.data.akce_id,
      supabase
    ).catch((err) => console.error("Auto-log experience error:", err))
  }

  return { success: true }
}

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

const dochazkaAuthSchema = z.object({
  prirazeni_id: z.string().uuid("Neplatné ID přiřazení"),
  akce_id: z.string().uuid("Neplatné ID akce"),
  brigadnik_id: z.string().uuid("Neplatné ID brigádníka"),
  prichod: z.string().optional(),
  odchod: z.string().optional(),
  hodnoceni: z.coerce.number().int().min(1).max(5).optional(),
  poznamka: z.string().optional(),
})

export async function saveDochazkaAuth(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())
  const parsed = dochazkaAuthSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }

  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from("dochazka")
    .select("id")
    .eq("prirazeni_id", parsed.data.prirazeni_id)
    .single()

  const dochazkaData = {
    prichod: parsed.data.prichod || null,
    odchod: parsed.data.odchod || null,
    hodnoceni: parsed.data.hodnoceni || null,
    poznamka: parsed.data.poznamka || null,
  }

  if (existing) {
    const { error } = await adminClient.from("dochazka").update(dochazkaData).eq("id", existing.id)
    if (error) return { error: "Nepodařilo se uložit docházku" }
  } else {
    const { error } = await adminClient.from("dochazka").insert({
      prirazeni_id: parsed.data.prirazeni_id,
      akce_id: parsed.data.akce_id,
      brigadnik_id: parsed.data.brigadnik_id,
      ...dochazkaData,
    })
    if (error) return { error: "Nepodařilo se uložit docházku" }
  }

  return { success: true }
}

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

function validateFieldValue(field: DochazkaField, value: unknown): { ok: true; value: string | number | null } | { ok: false; error: string } {
  const normalized = value === "" || value === undefined ? null : value
  const schema = FIELD_VALIDATORS[field]
  const parsed = schema.safeParse(normalized)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neplatná hodnota" }
  }
  return { ok: true, value: parsed.data as string | number | null }
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

  // 3. Zjisti prirazeni → akce_id, brigadnik_id, pin_kod
  const { data: prir } = await supabase
    .from("prirazeni")
    .select("id, akce_id, brigadnik_id, akce:akce(pin_kod)")
    .eq("id", prirazeniId)
    .single()

  if (!prir) return { error: "Přiřazení nenalezeno" }

  const akceId = prir.akce_id as string
  const brigadnikId = prir.brigadnik_id as string
  const pinKod = ((prir.akce as unknown) as { pin_kod: string } | null)?.pin_kod

  // 4. PIN verify + rate limit pro koordinátora
  if (editor.type === "koordinator") {
    if (!pinKod || pinKod !== editor.pin) return { error: "Neplatný PIN" }
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
    .select("id, akce_id, brigadnik_id, status, akce:akce(pin_kod)")
    .eq("id", prirazeniId)
    .single()
  if (!prir) return { error: "Přiřazení nenalezeno" }

  const akceId = prir.akce_id as string
  const brigadnikId = prir.brigadnik_id as string
  const pinKod = ((prir.akce as unknown) as { pin_kod: string } | null)?.pin_kod

  // Koordinator PIN check
  let editorId: string
  if (editor.type === "admin") {
    editorId = editor.id
  } else {
    if (!pinKod || pinKod !== editor.pin) return { error: "Neplatný PIN" }
    editorId = koordinatorFingerprint(editor.pin, akceId)
  }

  // Guard — už má zaznamenaný příchod?
  const { data: doch } = await supabase
    .from("dochazka")
    .select("prichod")
    .eq("prirazeni_id", prirazeniId)
    .maybeSingle()
  if (doch && doch.prichod) {
    return { error: "Brigádník už má zaznamenaný příchod" }
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
    popis: "Brigádník nepřišel na akci",
    metadata: {
      prirazeni_id: prirazeniId,
      editor_type: editor.type,
      editor_id: editorId,
      previous_status: prir.status,
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
    .select("id, akce_id, brigadnik_id, status, akce:akce(pin_kod)")
    .eq("id", prirazeniId)
    .single()
  if (!prir) return { error: "Přiřazení nenalezeno" }

  if (prir.status !== "vypadl") {
    return { error: "Brigádník není označen jako „nepřišel\"" }
  }

  const akceId = prir.akce_id as string
  const brigadnikId = prir.brigadnik_id as string
  const pinKod = ((prir.akce as unknown) as { pin_kod: string } | null)?.pin_kod

  let editorId: string
  if (editor.type === "admin") {
    editorId = editor.id
  } else {
    if (!pinKod || pinKod !== editor.pin) return { error: "Neplatný PIN" }
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

  // Role check
  const { data: internalUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single()
  if (!internalUser || !["admin", "naborar"].includes(internalUser.role)) {
    return { error: "Nemáte oprávnění" as const }
  }

  const admin = createAdminClient()

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
    .select("id, nazev, datum, cas_od, cas_do, misto, stav, nabidka_id, pin_kod")
    .eq("id", akceId)
    .single()

  if (!akce || akce.pin_kod !== pin) {
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
