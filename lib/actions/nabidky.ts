"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { normalizeTime } from "@/lib/utils/time"
import { z } from "zod"

// ================================================================
// F-0012 — Zod schemas
// ================================================================

const nabidkaCoreShape = z.object({
  nazev: z.string().min(1, "Název je povinný"),
  klient: z.string().optional(),
  typ_pozice: z.string().optional(),
  popis_prace: z.string().optional(),
  pozadavky: z.string().optional(),
  odmena: z.string().optional(),
  misto: z.string().optional(),
  datum_od: z.string().optional(),
  datum_do: z.string().optional(),
  // Team roles & rates: pocet_lidi je v DB GENERATED (součet níže), do
  // INSERT/UPDATE se neposílá.
  pocet_brigadniku: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
  pocet_koordinatoru: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
  // Sazby per role na zakázce (snapshot do prirazeni.sazba_hodinova v PR C).
  // NULL u sazba_koordinator znamená "zakázka nemá povoleného koordinátora".
  sazba_brigadnik: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().nonnegative().optional(),
  ),
  sazba_koordinator: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().nonnegative().optional(),
  ),
  slug: z.string().optional(),
  publikovano: z.boolean().optional(),
  koho_hledame: z.string().optional(),
  co_nabizime: z.string().optional(),
})

const createJednodenniBase = nabidkaCoreShape.extend({
  typ: z.literal("jednodenni"),
  akce_datum: z.string().min(1, "Datum akce je povinné"),
  akce_misto: z.string().optional(),
  akce_cas_od: z.string().optional(),
  akce_cas_do: z.string().optional(),
  // akce.pocet_lidi je GENERATED — posíláme jen rozdělení.
  akce_pocet_brigadniku: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
  akce_pocet_koordinatoru: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
})

const createOpakovanaBase = nabidkaCoreShape.extend({
  typ: z.literal("opakovana"),
})

const createNabidkaSchema = z.discriminatedUnion("typ", [
  createJednodenniBase,
  createOpakovanaBase,
]).superRefine((val, ctx) => {
  // Zopakuj refines (discriminatedUnion neumí přijmout effects schemas přímo)
  const pb = (val as { pocet_brigadniku?: number }).pocet_brigadniku ?? 0
  const pk = (val as { pocet_koordinatoru?: number }).pocet_koordinatoru ?? 0
  const sb = (val as { sazba_brigadnik?: number }).sazba_brigadnik
  const sk = (val as { sazba_koordinator?: number }).sazba_koordinator
  if (pb >= 1 && sb == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pro brigádníka je nutné vyplnit hodinovou sazbu", path: ["sazba_brigadnik"] })
  }
  if (pk >= 1 && sk == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pro koordinátora je nutné vyplnit hodinovou sazbu", path: ["sazba_koordinator"] })
  }
  if (sk == null && pk > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Bez sazby koordinátora nelze mít koordinátory v týmu", path: ["pocet_koordinatoru"] })
  }
})

// Update schema: typ is NOT allowed in patch (immutability guard I3)
const updateNabidkaSchema = nabidkaCoreShape.strict().superRefine((val, ctx) => {
  const pb = (val as { pocet_brigadniku?: number }).pocet_brigadniku ?? 0
  const pk = (val as { pocet_koordinatoru?: number }).pocet_koordinatoru ?? 0
  const sb = (val as { sazba_brigadnik?: number }).sazba_brigadnik
  const sk = (val as { sazba_koordinator?: number }).sazba_koordinator
  if (pb >= 1 && sb == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pro brigádníka je nutné vyplnit hodinovou sazbu", path: ["sazba_brigadnik"] })
  }
  if (pk >= 1 && sk == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pro koordinátora je nutné vyplnit hodinovou sazbu", path: ["sazba_koordinator"] })
  }
  if (sk == null && pk > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Bez sazby koordinátora nelze mít koordinátory v týmu", path: ["pocet_koordinatoru"] })
  }
})

// ================================================================
// Helpers
// ================================================================

function generateSlug(nazev: string): string {
  return nazev
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

// F-0021b: dual-write PIN (plaintext + bcrypt) — viz generatePinPair.
import { generatePinPair } from "@/lib/utils/pin"

async function getInternalUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("users").select("id").eq("auth_user_id", user.id).single()
  return data?.id ?? null
}

async function insertAudit(typ: string, popis: string, extra: {
  nabidka_id?: string
  akce_id?: string
  brigadnik_id?: string
  metadata?: Record<string, unknown>
} = {}) {
  const supabase = await createClient()
  const user_id = await getInternalUserId()
  await supabase.from("historie").insert({
    typ,
    popis,
    user_id,
    ...extra,
  })
}

// ================================================================
// Lazy auto-ukončení jednodenních zakázek (volá se v listingu)
// ================================================================

async function autoUkoncitJednodenniBatch(): Promise<void> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  // Najdi jednodenni zakázky, které mají alespoň jednu akci a všechny akce jsou v minulosti
  const { data: candidates } = await supabase
    .from("nabidky")
    .select("id, akce!inner(datum)")
    .eq("typ", "jednodenni")

  if (!candidates?.length) return

  const toClose: string[] = []
  for (const n of candidates as Array<{ id: string; akce: Array<{ datum: string }> }>) {
    if (!n.akce?.length) continue
    const allPast = n.akce.every(a => a.datum < today)
    if (allPast) toClose.push(n.id)
  }

  if (toClose.length === 0) return

  await supabase
    .from("nabidky")
    .update({ typ: "ukoncena", publikovano: false })
    .in("id", toClose)

  // Audit log (best-effort, nebloci)
  const user_id = await getInternalUserId()
  await supabase.from("historie").insert(
    toClose.map(id => ({
      nabidka_id: id,
      typ: "nabidka_auto_ukoncit",
      popis: "Automaticky ukončeno (všechny akce proběhly)",
      user_id,
    }))
  )
}

// ================================================================
// Queries
// ================================================================

export async function getNabidky(filter?: { filtr?: string }) {
  // Lazy check — mění databázi, spouští se při každém listingu
  await autoUkoncitJednodenniBatch().catch(() => {})

  const supabase = await createClient()
  let query = supabase
    .from("nabidky")
    .select("*, pipeline_entries(id, stav)")
    .order("created_at", { ascending: false })

  if (filter?.filtr === "jednodenni") {
    query = query.eq("typ", "jednodenni")
  } else if (filter?.filtr === "opakovana") {
    query = query.eq("typ", "opakovana")
  } else if (filter?.filtr === "ukoncena") {
    query = query.eq("typ", "ukoncena")
  }
  // "vse" — no filter, show all including ukoncena

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map(n => {
    const entries = (n.pipeline_entries ?? []) as { stav: string }[]
    return {
      ...n,
      pipeline_entries: undefined,
      stats: {
        celkem: entries.length,
        zajemci: entries.filter(e => e.stav === "zajemce").length,
        kontaktovani: entries.filter(e => e.stav === "kontaktovan").length,
        nehotovi: entries.filter(e => e.stav === "prijaty_nehotova_admin").length,
        vyreseno: entries.filter(e => e.stav === "prijaty_vse_vyreseno").length,
        odmitnuty: entries.filter(e => e.stav === "odmitnuty").length,
      }
    }
  })
}

export async function getNabidkaById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("nabidky")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return null
  return data
}

// ================================================================
// Create
// ================================================================

export async function createNabidka(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())
  // pocet_lidi (top-level i akce_pocet_lidi) je GENERATED v DB — vyhoď legacy
  // form pole, schema je nezná.
  const {
    pocet_lidi: _legacyPL,
    akce_pocet_lidi: _legacyAPL,
    ma_koordinatora,
    ...rest
  } = raw as Record<string, unknown>
  void _legacyPL
  void _legacyAPL

  // UI checkbox „Mít koordinátora" — pokud OFF, vynuluj pocet_koordinatoru
  // i sazba_koordinator (NULL = zakázán).
  const hasCoordinator = ma_koordinatora === "on" || ma_koordinatora === "true"
  const normalized = {
    ...rest,
    publikovano: rest.publikovano === "on" || rest.publikovano === "true",
    pocet_brigadniku: rest.pocet_brigadniku || undefined,
    pocet_koordinatoru: hasCoordinator ? (rest.pocet_koordinatoru || undefined) : 0,
    akce_pocet_brigadniku: rest.akce_pocet_brigadniku || undefined,
    akce_pocet_koordinatoru: hasCoordinator
      ? (rest.akce_pocet_koordinatoru || undefined)
      : 0,
    sazba_brigadnik: rest.sazba_brigadnik || undefined,
    sazba_koordinator: hasCoordinator ? (rest.sazba_koordinator || undefined) : undefined,
  }

  const parsed = createNabidkaSchema.safeParse(normalized)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const data = parsed.data
  const slug = data.slug || generateSlug(data.nazev)

  const { data: internalUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single()

  // Insert nabidka. pocet_lidi NESMÍ být v payloadu (GENERATED v DB).
  const nabidkaInsert: Record<string, unknown> = {
    nazev: data.nazev,
    typ: data.typ,
    klient: data.klient || null,
    typ_pozice: data.typ_pozice || null,
    popis_prace: data.popis_prace || null,
    pozadavky: data.pozadavky || null,
    odmena: data.odmena || null,
    misto: data.misto || null,
    datum_od: data.datum_od || null,
    datum_do: data.datum_do || null,
    pocet_brigadniku: data.pocet_brigadniku ?? 0,
    pocet_koordinatoru: data.pocet_koordinatoru ?? 0,
    sazba_brigadnik: data.sazba_brigadnik ?? null,
    sazba_koordinator: data.sazba_koordinator ?? null,
    slug,
    publikovano: data.publikovano ?? true,
    koho_hledame: data.koho_hledame || null,
    co_nabizime: data.co_nabizime || null,
    naborar_id: internalUser?.id ?? null,
  }

  const { data: inserted, error } = await supabase
    .from("nabidky")
    .insert(nabidkaInsert)
    .select("id, slug")
    .single()

  if (error || !inserted) {
    if (error?.code === "23505") return { error: "Zakázka s tímto slugem již existuje" }
    return { error: error?.message ?? "Nepodařilo se vytvořit zakázku" }
  }

  // For jednodenni: also create the akce. pocet_lidi NESMÍ být v payloadu
  // (GENERATED v DB) — místo toho zapisujeme pocet_brigadniku/koordinatoru.
  // Fallback z nabídky: když akce nemá vlastní rozdělení, zděď ho.
  if (data.typ === "jednodenni") {
    const pinPair = await generatePinPair()
    const { error: akceError } = await supabase.from("akce").insert({
      nazev: data.nazev,
      datum: data.akce_datum,
      cas_od: normalizeTime(data.akce_cas_od),
      cas_do: normalizeTime(data.akce_cas_do),
      misto: data.akce_misto || data.misto || null,
      klient: data.klient || null,
      nabidka_id: inserted.id,
      pocet_brigadniku:
        data.akce_pocet_brigadniku ?? data.pocet_brigadniku ?? 0,
      pocet_koordinatoru:
        data.akce_pocet_koordinatoru ?? data.pocet_koordinatoru ?? 0,
      pin_kod: pinPair.plaintext,
      pin_hash: pinPair.hash,
    })

    if (akceError) {
      // Rollback the nabidka insertion
      await supabase.from("nabidky").delete().eq("id", inserted.id)
      return { error: `Nepodařilo se vytvořit akci: ${akceError.message}` }
    }
  }

  await insertAudit(
    "nabidka_zmena",
    `Vytvořena zakázka "${data.nazev}" (${data.typ})`,
    { nabidka_id: inserted.id, metadata: { typ: data.typ } }
  )

  revalidatePath("/app/nabidky")
  if (data.publikovano !== false) revalidatePath("/prace")
  return { success: true, id: inserted.id, slug: inserted.slug }
}

// ================================================================
// Update (typ immutable)
// ================================================================

export async function updateNabidka(id: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const raw = Object.fromEntries(formData.entries())

  // Split akce fields (handled separately for jednodenni), strip typ (immutable),
  // strip legacy pocet_lidi (GENERATED v DB, nelze zapsat).
  const {
    typ: _discardedTyp,
    akce_datum, akce_misto, akce_cas_od, akce_cas_do,
    akce_pocet_lidi: _legacyAPL,
    pocet_lidi: _legacyPL,
    akce_pocet_brigadniku,
    akce_pocet_koordinatoru,
    ma_koordinatora,
    ...rest
  } = raw as Record<string, unknown>
  void _discardedTyp
  void _legacyAPL
  void _legacyPL

  // UI checkbox „Mít koordinátora" — OFF znamená sazba_koordinator → NULL,
  // pocet_koordinatoru → 0 (jak na zakázce, tak na akci).
  const hasCoordinator = ma_koordinatora === "on" || ma_koordinatora === "true"
  const akcePocetKoordEffective = hasCoordinator ? akce_pocet_koordinatoru : "0"

  const normalized = {
    ...rest,
    publikovano: rest.publikovano === "on" || rest.publikovano === "true",
    pocet_brigadniku: rest.pocet_brigadniku || undefined,
    pocet_koordinatoru: hasCoordinator ? (rest.pocet_koordinatoru || undefined) : 0,
    sazba_brigadnik: rest.sazba_brigadnik || undefined,
    sazba_koordinator: hasCoordinator ? (rest.sazba_koordinator || undefined) : undefined,
  }

  const parsed = updateNabidkaSchema.safeParse(normalized)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  // Current state — cannot edit ukoncena
  const current = await getNabidkaById(id)
  if (!current) return { error: "Zakázka nenalezena" }
  if (current.typ === "ukoncena") return { error: "Ukončenou zakázku nelze upravovat" }

  // pocet_lidi do payloadu nepatří (GENERATED v DB).
  const updatePayload: Record<string, unknown> = {
    ...parsed.data,
    datum_od: parsed.data.datum_od || null,
    datum_do: parsed.data.datum_do || null,
    klient: parsed.data.klient || null,
    typ_pozice: parsed.data.typ_pozice || null,
    popis_prace: parsed.data.popis_prace || null,
    pozadavky: parsed.data.pozadavky || null,
    odmena: parsed.data.odmena || null,
    misto: parsed.data.misto || null,
    koho_hledame: parsed.data.koho_hledame || null,
    co_nabizime: parsed.data.co_nabizime || null,
  }
  if (parsed.data.pocet_brigadniku !== undefined) {
    updatePayload.pocet_brigadniku = parsed.data.pocet_brigadniku
  }
  if (parsed.data.pocet_koordinatoru !== undefined) {
    updatePayload.pocet_koordinatoru = parsed.data.pocet_koordinatoru
  }
  if (parsed.data.sazba_brigadnik !== undefined) {
    updatePayload.sazba_brigadnik = parsed.data.sazba_brigadnik
  }
  // sazba_koordinator: explicitně zapisuj i NULL (uncheck „Mít koordinátora")
  if (hasCoordinator) {
    if (parsed.data.sazba_koordinator !== undefined) {
      updatePayload.sazba_koordinator = parsed.data.sazba_koordinator
    }
  } else {
    updatePayload.sazba_koordinator = null
  }

  // Edge case (Michal volba B): admin uncheck „Mít koordinátora", ale již
  // existují prirazeni s role='koordinator'. Povol změnu, vrať warning v toastu.
  let coordWarning: string | undefined
  const wasCoordinator =
    (current as { sazba_koordinator?: number | null }).sazba_koordinator !== null ||
    ((current as { pocet_koordinatoru?: number | null }).pocet_koordinatoru ?? 0) > 0
  if (wasCoordinator && !hasCoordinator) {
    const { count: koordPrirazeniCount } = await supabase
      .from("prirazeni")
      .select("id, akce!inner(nabidka_id)", { count: "exact", head: true })
      .eq("akce.nabidka_id", id)
      .eq("role", "koordinator")
    if ((koordPrirazeniCount ?? 0) > 0) {
      coordWarning = `Změnili jste sazbu koordinátora ale ${koordPrirazeniCount}+ koordinátor zůstává přiřazený se starou snapshot sazbou`
    }
  }

  const { error } = await supabase
    .from("nabidky")
    .update(updatePayload)
    .eq("id", id)

  if (error) return { error: error.message }

  // Pro jednodenni: upsert akce (1:1 vazba zakázka ↔ akce)
  let akceMessage = ""
  if (current.typ === "jednodenni") {
    const datumStr = String(akce_datum ?? "").trim()
    if (datumStr) {
      // pocet_lidi je GENERATED — místo toho zapisujeme rozdělení per role.
      // Když UI nepošle akce-level rozdělení, zděď ho ze zakázky (nebo 0).
      const akcePayload: Record<string, unknown> = {
        nazev: parsed.data.nazev ?? current.nazev,
        datum: datumStr,
        misto: String(akce_misto ?? parsed.data.misto ?? current.misto ?? "").trim() || null,
        cas_od: normalizeTime(akce_cas_od as string | null | undefined),
        cas_do: normalizeTime(akce_cas_do as string | null | undefined),
        klient: parsed.data.klient ?? current.klient ?? null,
        pocet_brigadniku: akce_pocet_brigadniku
          ? Number(akce_pocet_brigadniku)
          : parsed.data.pocet_brigadniku ?? 0,
        pocet_koordinatoru: akcePocetKoordEffective
          ? Number(akcePocetKoordEffective)
          : (hasCoordinator ? (parsed.data.pocet_koordinatoru ?? 0) : 0),
      }

      // Existing akce for this nabidka?
      const { data: existingAkce } = await supabase
        .from("akce")
        .select("id")
        .eq("nabidka_id", id)
        .limit(1)
        .maybeSingle()

      if (existingAkce) {
        const { error: updErr } = await supabase
          .from("akce")
          .update(akcePayload)
          .eq("id", existingAkce.id)
        if (updErr) return { error: `Zakázka uložena, ale akce se nepodařilo aktualizovat: ${updErr.message}` }
        akceMessage = " + akce aktualizována"
      } else {
        const pinPair = await generatePinPair()
        const { error: insErr } = await supabase
          .from("akce")
          .insert({ ...akcePayload, nabidka_id: id, pin_kod: pinPair.plaintext, pin_hash: pinPair.hash })
        if (insErr) return { error: `Zakázka uložena, ale akce se nepodařilo vytvořit: ${insErr.message}` }
        akceMessage = " + akce vytvořena"
      }
    }
  }

  await insertAudit(
    "nabidka_zmena",
    `Upravena zakázka "${current.nazev}"${akceMessage}`,
    { nabidka_id: id }
  )

  revalidatePath(`/app/nabidky/${id}`)
  revalidatePath("/app/nabidky")
  revalidatePath("/app/akce")
  revalidatePath("/prace")
  if (current.slug) revalidatePath(`/prace/${current.slug}`)
  return coordWarning ? { success: true, warning: coordWarning } : { success: true }
}

// ================================================================
// Publish toggle
// ================================================================

export async function togglePublikovano(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const current = await getNabidkaById(id)
  if (!current) return { error: "Zakázka nenalezena" }
  if (current.typ === "ukoncena") return { error: "Ukončenou zakázku nelze publikovat" }

  const next = !current.publikovano

  const { error } = await supabase
    .from("nabidky")
    .update({ publikovano: next })
    .eq("id", id)

  if (error) return { error: error.message }

  await insertAudit(
    "nabidka_zmena",
    next ? `Zakázka "${current.nazev}" publikována na /prace` : `Zakázka "${current.nazev}" stažena z /prace`,
    { nabidka_id: id, metadata: { publikovano: next } }
  )

  revalidatePath("/app/nabidky")
  revalidatePath(`/app/nabidky/${id}`)
  revalidatePath("/prace")
  if (current.slug) revalidatePath(`/prace/${current.slug}`)
  return { success: true, publikovano: next }
}

// ================================================================
// Ukončit (manuální)
// ================================================================

export async function ukoncitNabidku(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const current = await getNabidkaById(id)
  if (!current) return { error: "Zakázka nenalezena" }
  if (current.typ === "ukoncena") return { error: "Zakázka je už ukončená" }

  const { error } = await supabase
    .from("nabidky")
    .update({ typ: "ukoncena", publikovano: false })
    .eq("id", id)

  if (error) return { error: error.message }

  await insertAudit(
    "nabidka_zmena",
    `Zakázka "${current.nazev}" ukončena`,
    { nabidka_id: id, metadata: { manual: true } }
  )

  revalidatePath("/app/nabidky")
  revalidatePath(`/app/nabidky/${id}`)
  revalidatePath("/prace")
  if (current.slug) revalidatePath(`/prace/${current.slug}`)
  return { success: true }
}
