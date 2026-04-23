"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { maybeEncryptDic, encrypt } from "@/lib/utils/crypto"
import { sanitizeError } from "@/lib/utils/error-sanitizer"
import { z } from "zod"
import {
  updateBrigadnikTypSchema,
  updateBrigadnikOsvcFieldsSchema,
} from "@/lib/schemas/dotaznik"
import { DOKUMENTACNI_STAV_RANK, RANK_TO_DOKUMENTACNI_STAV } from "@/lib/schemas/hodnoceni"
import { maybeAutoTransitionPipeline } from "./pipeline"
import {
  buildDokumentacniPredicate,
  type AlertFilterKey,
  type EnrichedBrigadnikForFilter,
} from "./dashboard-filters"

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
  /** F-0016: filter dle typ_brigadnika. 'all' = oba. */
  typFilter?: "all" | "brigadnik" | "osvc"
  /** F-0016: multi-select dokumentační status (global = MAX priority přes pipeline). */
  stavFilter?: string[]
  /** F-0017: preset filter z dashboard alertů (bez_dpp, bez_prohlaseni, ...).
   *  Aplikuje se AND s ostatními filtry. Sdílí predicate s `getDashboardAlerts`
   *  (alert count ↔ filtrovaný list count musí match). */
  filterKey?: AlertFilterKey
  /** F-0021a: true = zobrazit i blokované brigádníky. Default false = skryto. */
  zahrnoutBlokovane?: boolean
}) {
  const supabase = await createClient()
  let query = supabase
    .from("v_brigadnici_aktualni")
    .select("*")
    .order("prijmeni", { ascending: true })

  if (filter?.aktivni !== false) {
    query = query.eq("aktivni", true)
  }

  // F-0016 D-F0016-06: soft-deleted výchozí skryto. VIEW už filtruje
  // deleted_at IS NULL, ale explicit pojistka (kdyby se volalo přes admin).
  // Žádný navíc where clause — view se o to stará.

  // F-0021a: blokovaní brigádníci skryti v default listu.
  // POZN: v_brigadnici_aktualni view neexpozuje `zablokovan_at`
  // (view vytvořena v F-0016 přes `SELECT b.*` — Postgres snapshotuje
  // sloupce při CREATE VIEW, nové sloupce přidané později nejsou
  // automaticky součástí expanze). Schema freeze po 27.4. neumožňuje
  // view recreate, takže filter děláme přes separate subquery proti
  // base table a používáme .not("id", "in", ...) na view.
  if (!filter?.zahrnoutBlokovane) {
    const { data: blocked } = await supabase
      .from("brigadnici")
      .select("id")
      .not("zablokovan_at", "is", null)
    const blockedIds = (blocked ?? []).map((b) => (b as { id: string }).id)
    if (blockedIds.length > 0) {
      query = query.not("id", "in", `(${blockedIds.join(",")})`)
    }
  }

  if (filter?.typFilter && filter.typFilter !== "all") {
    query = query.eq("typ_brigadnika", filter.typFilter)
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

    // F-0016 US-1G-1: global dokumentační status = MAX priority přes všechny
    // pipeline entries brigádníka. Viz v_brigadnik_zakazka_status (6 hodnot).
    // Fallback: brigádník bez pipeline entry → 'osvc' pokud typ=osvc, jinak
    // 'nevyplnene_udaje'.
    const { data: stavRows } = await supabase
      .from("v_brigadnik_zakazka_status")
      .select("brigadnik_id, dokumentacni_stav")
      .in("brigadnik_id", brigadnikIds)

    const globalStavMap = new Map<string, string>()
    for (const row of stavRows ?? []) {
      const rank = DOKUMENTACNI_STAV_RANK[row.dokumentacni_stav] ?? 0
      const existingStav = globalStavMap.get(row.brigadnik_id)
      const existingRank = existingStav
        ? (DOKUMENTACNI_STAV_RANK[existingStav] ?? 0)
        : -1
      if (rank > existingRank) {
        globalStavMap.set(row.brigadnik_id, row.dokumentacni_stav)
      }
    }

    const enriched = (data ?? []).map(b => {
      let globalStav = globalStavMap.get(b.id)
      if (!globalStav) {
        globalStav =
          (b as { typ_brigadnika?: string }).typ_brigadnika === "osvc"
            ? "osvc"
            : "nevyplnene_udaje"
      }
      return {
        ...b,
        pocet_akci: actionCounts.get(b.id) ?? 0,
        dpp_tento_rok: dppMap.get(b.id)?.current ?? "zadny",
        dpp_pristi_rok: dppMap.get(b.id)?.next ?? "zadny",
        global_dokumentacni_stav: globalStav,
      }
    })

    // F-0016: post-filter podle stavFilter (multi-select). Počítáno app-side
    // protože global status je computed. Acceptable < 2000 rows (viz architect 3.2).
    const filteredByStav = filter?.stavFilter && filter.stavFilter.length > 0
      ? enriched.filter(b => filter.stavFilter!.includes(b.global_dokumentacni_stav))
      : enriched

    // F-0017: aplikace preset filter key (bez_dpp, bez_prohlaseni, ...).
    // AND s předchozími filtry. Sdílený predikát s getDashboardAlerts →
    // zaručuje count parity (QA-critical).
    const filteredByKey = filter?.filterKey
      ? filteredByStav.filter(b =>
          buildDokumentacniPredicate(filter.filterKey!)(b as EnrichedBrigadnikForFilter)
        )
      : filteredByStav

    filteredByKey.sort((a, b) => {
      if (b.pocet_akci !== a.pocet_akci) return b.pocet_akci - a.pocet_akci
      const ratingA = Number(a.prumerne_hodnoceni) || 0
      const ratingB = Number(b.prumerne_hodnoceni) || 0
      if (ratingB !== ratingA) return ratingB - ratingA
      return (a.prijmeni ?? "").localeCompare(b.prijmeni ?? "")
    })

    return filteredByKey
  } catch {
    return (data ?? []).map(b => ({
      ...b,
      pocet_akci: 0,
      dpp_tento_rok: "zadny",
      dpp_pristi_rok: "zadny",
      global_dokumentacni_stav:
        (b as { typ_brigadnika?: string }).typ_brigadnika === "osvc"
          ? "osvc"
          : "nevyplnene_udaje",
    }))
  }
}

/**
 * F-0016 US-1A-1: seznam akcí brigádníka split na budoucí + historie.
 *
 * - JOIN prirazeni × akce × nabidky (LEFT na nabidku, akce má nabidka_id NULLable).
 * - Split podle akce.datum vs CURRENT_DATE.
 * - Budoucí: ASC (nejblíže nahoře), historie: DESC LIMIT 100 (US-1A-1 edge case 8).
 * - Zahrnuje akce.stav (F-0015) pro "Zrušena" tagging.
 */
export async function getBrigadnikAkce(brigadnikId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("prirazeni")
    .select(
      `
      id, akce_id, status, pozice, poradi_nahradnik,
      akce:akce(id, nazev, datum, cas_od, cas_do, misto, stav, nabidka_id,
                nabidka:nabidky(id, nazev))
    `
    )
    .eq("brigadnik_id", brigadnikId)
    .limit(500)

  if (error || !data) return { budouci: [], historie: [] }

  // Normalize akce object (Supabase JOIN vrací object nebo array dle konfigurace).
  type Row = typeof data[number]
  const rows = data.filter((r): r is Row & { akce: NonNullable<Row["akce"]> } => !!r.akce)

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const budouci: typeof rows = []
  const historie: typeof rows = []

  for (const r of rows) {
    const akce = Array.isArray(r.akce) ? r.akce[0] : r.akce
    if (!akce) continue
    const datum = (akce as { datum: string }).datum
    if (datum >= today) budouci.push(r)
    else historie.push(r)
  }

  budouci.sort((a, b) => {
    const aa = Array.isArray(a.akce) ? a.akce[0] : a.akce
    const bb = Array.isArray(b.akce) ? b.akce[0] : b.akce
    const da = (aa as { datum: string }).datum
    const db = (bb as { datum: string }).datum
    if (da !== db) return da.localeCompare(db)
    const ta = (aa as { cas_od: string | null }).cas_od ?? ""
    const tb = (bb as { cas_od: string | null }).cas_od ?? ""
    return ta.localeCompare(tb)
  })

  historie.sort((a, b) => {
    const aa = Array.isArray(a.akce) ? a.akce[0] : a.akce
    const bb = Array.isArray(b.akce) ? b.akce[0] : b.akce
    const da = (aa as { datum: string }).datum
    const db = (bb as { datum: string }).datum
    return db.localeCompare(da)
  })

  return {
    budouci,
    historie: historie.slice(0, 100),
  }
}

// NOTE: DOKUMENTACNI_STAV_RANK / RANK_TO_DOKUMENTACNI_STAV nejsou re-exportovány
// z tohoto "use server" modulu (Turbopack constraint — only async server actions
// in "use server" files). Frontend importuje rovnou z `@/lib/schemas/hodnoceni`.

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

  if (error) return { error: sanitizeError(error, "updateBrigadnik") }

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
 * F-0016 follow-up: manuální nastavení dokumentačního stavu (6 hodnot dle
 * `v_brigadnik_zakazka_status`). Používá se v /app/brigadnici listu,
 * AssignmentMatrix (nabídky detail) a akce detail — admin/náborářka může
 * stav přepnout bez procházení plného DPP workflow (papírové podpisy atd.).
 *
 * Target-stav mapování na úložiště (rok = current calendar year):
 *  - osvc              → brigadnici.typ_brigadnika='osvc' (VIEW priorita 1)
 *  - ukoncena_dpp      → smluvni_stav.dpp_stav='ukoncena' (priorita 2)
 *  - podepsana_dpp     → dpp_stav='podepsano' + platnost_do=YYYY-12-31 (priorita 3)
 *  - poslana_dpp       → dpp_stav='odeslano' + dpp_odeslano_at (priorita 4)
 *  - vyplnene_udaje    → dotaznik_vyplnen=true, smluvni_stav bez dpp (priorita 5)
 *  - nevyplnene_udaje  → dotaznik_vyplnen=false, smluvni_stav reset (priorita 6)
 *
 * Přepnutí z osvc na jiný stav: typ_brigadnika='brigadnik' (osvc_* zůstávají pro historii).
 *
 * Audit: 1 řádek `historie` typu `dokumentacni_stav_manual_change` s metadata
 * { target_stav, previous_stav_computed?, rok }. Žádné PII.
 */
export async function setDokumentacniStavManual(
  brigadnikId: string,
  stav: "nevyplnene_udaje" | "vyplnene_udaje" | "poslana_dpp" | "podepsana_dpp" | "ukoncena_dpp" | "osvc",
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const admin = createAdminClient()
  const { data: internalUser } = await admin
    .from("users").select("id").eq("auth_user_id", user.id).single()
  if (!internalUser) return { error: "Interní uživatel nenalezen" }

  const rok = new Date().getFullYear()

  // Target 1: OSVČ — jen flip typ_brigadnika, smluvni_stav ponecháme (VIEW dá osvc prioritu 1)
  if (stav === "osvc") {
    const { error: typErr } = await admin
      .from("brigadnici")
      .update({ typ_brigadnika: "osvc" })
      .eq("id", brigadnikId)
    if (typErr) return { error: `typ_brigadnika: ${typErr.message}` }
  } else {
    // Ostatní stavy: osvc→brigadnik flip pokud je teď osvc
    const { data: current, error: readErr } = await admin
      .from("brigadnici")
      .select("typ_brigadnika, dotaznik_vyplnen")
      .eq("id", brigadnikId)
      .single()
    if (readErr) return { error: `read brigadnika: ${readErr.message}` }
    if (!current) return { error: "Brigádník nenalezen" }

    if (current.typ_brigadnika === "osvc") {
      const { error: unosvc } = await admin.from("brigadnici").update({ typ_brigadnika: "brigadnik" }).eq("id", brigadnikId)
      if (unosvc) return { error: `flip osvc→brigadnik: ${unosvc.message}` }
    }

    // Upravit dotaznik_vyplnen podle cílového stavu
    if (stav === "nevyplnene_udaje") {
      if (current.dotaznik_vyplnen !== false) {
        const { error: dErr } = await admin.from("brigadnici").update({ dotaznik_vyplnen: false }).eq("id", brigadnikId)
        if (dErr) return { error: `dotaznik→false: ${dErr.message}` }
      }
    } else {
      // vyplnene_udaje, poslana_dpp, podepsana_dpp, ukoncena_dpp → vyžaduje dotaznik_vyplnen=true
      if (current.dotaznik_vyplnen !== true) {
        const { error: dErr } = await admin.from("brigadnici").update({ dotaznik_vyplnen: true }).eq("id", brigadnikId)
        if (dErr) return { error: `dotaznik→true: ${dErr.message}` }
      }
    }

    // Smluvni_stav úprava
    const { data: existingSs, error: ssReadErr } = await admin
      .from("smluvni_stav")
      .select("id")
      .eq("brigadnik_id", brigadnikId)
      .eq("rok", rok)
      .maybeSingle()
    if (ssReadErr) return { error: `read smluvni_stav: ${ssReadErr.message}` }

    const now = new Date().toISOString()
    const dppUpdate: Record<string, unknown> = {}

    if (stav === "nevyplnene_udaje" || stav === "vyplnene_udaje") {
      // Reset: dpp_stav='zadny', clear timestamps, clear platnost
      dppUpdate.dpp_stav = "zadny"
      dppUpdate.dpp_odeslano_at = null
      dppUpdate.dpp_podepsano_at = null
      dppUpdate.platnost_do = null
    } else if (stav === "poslana_dpp") {
      dppUpdate.dpp_stav = "odeslano"
      dppUpdate.dpp_odeslano_at = now
      dppUpdate.dpp_podepsano_at = null
      dppUpdate.platnost_do = null
    } else if (stav === "podepsana_dpp") {
      dppUpdate.dpp_stav = "podepsano"
      dppUpdate.dpp_podepsano_at = now
      dppUpdate.platnost_do = `${rok}-12-31`
    } else if (stav === "ukoncena_dpp") {
      dppUpdate.dpp_stav = "ukoncena"
    }

    if (existingSs) {
      const { error: upErr } = await admin
        .from("smluvni_stav")
        .update(dppUpdate)
        .eq("id", existingSs.id)
      if (upErr) return { error: `update smluvni_stav: ${upErr.message}` }
    } else {
      const { error: insErr } = await admin
        .from("smluvni_stav")
        .insert({ brigadnik_id: brigadnikId, rok, ...dppUpdate })
      if (insErr) return { error: `insert smluvni_stav: ${insErr.message}` }
    }
  }

  await admin.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: internalUser.id,
    typ: "dokumentacni_stav_manual_change",
    popis: `Dokumentační stav manuálně nastaven na: ${stav}`,
    metadata: { target_stav: stav, rok, manual: true },
  })

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  revalidatePath("/app/brigadnici")
  revalidatePath("/app/nabidky", "layout")
  revalidatePath("/app/akce", "layout")
  return { success: true }
}

/**
 * F-0016 follow-up: editace citlivých údajů (RČ + číslo dokladu totožnosti).
 *
 * Šifrováno per F-0013 Security addendum (AES-256-GCM via `encrypt()`).
 * Audit **nezapisuje old/new hodnoty** — GDPR/privacy first; jen název pole se objeví
 * v `historie.metadata.changed_fields`.
 *
 * Prázdné / whitespace-only stringy = no-op pro daný field (neumožníme vymazat omylem).
 * Pro výmaz by měl být dedicated action; deferred.
 */
const citliveUdajeSchema = z.object({
  rodne_cislo: z.string().trim().min(3).max(20).optional(),
  cislo_op:    z.string().trim().min(3).max(40).optional(),
})

export async function updateBrigadnikCitliveUdaje(
  id: string,
  input: { rodne_cislo?: string; cislo_op?: string },
) {
  const parsed = citliveUdajeSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje" }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const admin = createAdminClient()
  const { data: internalUser } = await admin
    .from("users").select("id").eq("auth_user_id", user.id).single()
  if (!internalUser) return { error: "Interní uživatel nenalezen" }

  const changedFields: string[] = []
  const update: Record<string, string> = {}

  if (parsed.data.rodne_cislo) {
    update.rodne_cislo = encrypt(parsed.data.rodne_cislo)
    changedFields.push("rodne_cislo")
  }
  if (parsed.data.cislo_op) {
    update.cislo_op = encrypt(parsed.data.cislo_op)
    changedFields.push("cislo_op")
  }

  if (changedFields.length === 0) {
    return { success: true, noop: true }
  }

  const { error } = await admin.from("brigadnici").update(update).eq("id", id)
  if (error) return { error: error.message }

  // Audit bez hodnot (PII)
  await admin.from("historie").insert({
    brigadnik_id: id,
    user_id: internalUser.id,
    typ: "brigadnik_citlive_udaje_change",
    popis: `Změna citlivých údajů: ${changedFields.join(", ")}`,
    metadata: { changed_fields: changedFields },
  })

  revalidatePath(`/app/brigadnici/${id}`)
  return { success: true }
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
    .select("*, nabidka:nabidky(id, nazev, typ)")
    .eq("brigadnik_id", brigadnikId)
    .order("created_at", { ascending: false })

  if (error) {
    // MD-2: do F-0012 byl na nabidky sloupec `stav` — ten je ale DROPped.
    // Pokud query padne z jiného důvodu, logujeme do server logu, ale
    // stále vracíme [] aby UI nespadlo. Typ vrátí 'ukoncena' pokud je
    // nabidka archivní (nahrazuje bývalý stav='ukoncena').
    console.error("[getBrigadnikPipeline] query failed", error)
    return []
  }
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

/**
 * F-0014 1D — filtered timeline jen pro komunikační eventy.
 * Typ IN: email_odeslan, email_prijaty, dotaznik_odeslan, dpp_odeslan, prohlaseni_odeslan.
 * Řazeno DESC dle created_at.
 */
const KOMUNIKACE_HISTORIE_TYPES = [
  "email_odeslan",
  "email_prijaty",
  "dotaznik_odeslan",
  "dpp_odeslan",
  "prohlaseni_odeslan",
] as const

export async function getBrigadnikKomunikaceHistorie(
  brigadnikId: string,
  limit: number = 50
) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("historie")
    .select("*")
    .eq("brigadnik_id", brigadnikId)
    .in("typ", KOMUNIKACE_HISTORIE_TYPES as unknown as string[])
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return []
  return data
}

// ============================================================
// F-0021a — Manuální blokace brigádníka (LG-5 z auditu)
// ============================================================
// Admin/náborář může ručně zablokovat problematického brigádníka.
// Po blokaci se neobjevuje v default listech/matrix. Unblock kdykoli.
// Schema: brigadnici.zablokovan_at / zablokovan_duvod / zablokoval_user_id
// (F-0021a migrace applied 2026-04-27).
//
// NENÍ auto-block na základě ratingu — vždy manuální rozhodnutí.
// ============================================================

const blokovatSchema = z.object({
  id: z.string().uuid(),
  duvod: z.string().trim().max(500).optional(),
})

export async function blokovatBrigadnika(
  id: string,
  duvod?: string,
): Promise<{ success: true } | { error: string }> {
  const parsed = blokovatSchema.safeParse({ id, duvod })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje" }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const admin = createAdminClient()
  const { data: internalUser } = await admin
    .from("users").select("id").eq("auth_user_id", user.id).single()
  if (!internalUser) return { error: "Interní uživatel nenalezen" }

  const { error } = await admin
    .from("brigadnici")
    .update({
      zablokovan_at: new Date().toISOString(),
      zablokovan_duvod: parsed.data.duvod ?? null,
      zablokoval_user_id: (internalUser as { id: string }).id,
    })
    .eq("id", id)

  if (error) return { error: sanitizeError(error, "blokovatBrigadnika") }

  await admin.from("historie").insert({
    brigadnik_id: id,
    user_id: (internalUser as { id: string }).id,
    typ: "brigadnik_zablokovan",
    popis: parsed.data.duvod
      ? `Brigádník zablokován: ${parsed.data.duvod.slice(0, 200)}`
      : "Brigádník zablokován (bez důvodu)",
    metadata: { duvod: parsed.data.duvod ?? null },
  })

  revalidatePath(`/app/brigadnici/${id}`)
  revalidatePath("/app/brigadnici")
  return { success: true }
}

export async function odblokovatBrigadnika(
  id: string,
): Promise<{ success: true } | { error: string }> {
  if (!id) return { error: "Chybí ID" }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const admin = createAdminClient()
  const { data: internalUser } = await admin
    .from("users").select("id").eq("auth_user_id", user.id).single()
  if (!internalUser) return { error: "Interní uživatel nenalezen" }

  const { error } = await admin
    .from("brigadnici")
    .update({
      zablokovan_at: null,
      zablokovan_duvod: null,
      zablokoval_user_id: null,
    })
    .eq("id", id)

  if (error) return { error: sanitizeError(error, "odblokovatBrigadnika") }

  await admin.from("historie").insert({
    brigadnik_id: id,
    user_id: (internalUser as { id: string }).id,
    typ: "brigadnik_odblokovan",
    popis: "Brigádník odblokován",
    metadata: {},
  })

  revalidatePath(`/app/brigadnici/${id}`)
  revalidatePath("/app/brigadnici")
  return { success: true }
}

/**
 * Upload fotografie brigádníka adminem/náborářkou.
 *
 * - Auth + role check (admin / naborar)
 * - Validace typu (JPG/PNG/HEIC) + velikosti (<=20 MB)
 * - Upload do crewmate-storage pod 'prihlasky/{id}/foto/{uuid}_foto.{ext}'
 *   (konzistentní s submitPrihlaska path)
 * - Update brigadnici.foto_url na novou cestu
 * - Historie záznam 'foto_upload'
 */
export async function uploadBrigadnikFoto(
  brigadnikId: string,
  formData: FormData,
): Promise<{ success: true } | { error: string }> {
  const { isAllowedPhotoType, MAX_FILE_SIZE } = await import("@/lib/utils/sanitize")

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const admin = createAdminClient()
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
    return { error: "Nemáte oprávnění" }
  }

  const file = formData.get("foto") as File | null
  if (!file || !(file instanceof File) || file.size === 0) {
    return { error: "Nebyl přiložen žádný soubor" }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { error: "Soubor je příliš velký (max 20 MB)" }
  }
  if (!isAllowedPhotoType(file.type)) {
    return { error: "Nepodporovaný formát. Povolené: JPG, PNG, HEIC." }
  }

  const { data: existing } = await admin
    .from("brigadnici")
    .select("id")
    .eq("id", brigadnikId)
    .single()
  if (!existing) return { error: "Brigádník nenalezen" }

  const ext = file.name.split(".").pop() ?? "jpg"
  const uniqueId = crypto.randomUUID().slice(0, 8)
  const path = `prihlasky/${brigadnikId}/foto/${uniqueId}_foto.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from("crewmate-storage")
    .upload(path, buffer, { contentType: file.type, upsert: true })
  if (uploadError) {
    return { error: "Upload selhal: " + uploadError.message }
  }

  const { error: updateError } = await admin
    .from("brigadnici")
    .update({ foto_url: path })
    .eq("id", brigadnikId)
  if (updateError) {
    return { error: "Nepodařilo se uložit odkaz na foto" }
  }

  await admin.from("historie").insert({
    brigadnik_id: brigadnikId,
    user_id: internalUser.id,
    typ: "foto_upload",
    popis: "Nahrána fotografie brigádníka",
  })

  revalidatePath(`/app/brigadnici/${brigadnikId}`)
  return { success: true }
}
