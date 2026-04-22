"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getBrigadnici } from "./brigadnici"
import {
  ALERT_FILTER_KEYS,
  buildDokumentacniPredicate,
  FILTER_KEY_LABELS,
  type AlertFilterKey,
  type EnrichedBrigadnikForFilter,
} from "./dashboard-filters"

// ================================================================
// Types
// ================================================================

export type UserRole = "admin" | "naborar"

export interface NadchazejiciAkce {
  id: string
  nazev: string
  datum: string
  cas_od: string | null
  misto: string | null
  pocet_lidi: number | null
  nabidka_id: string | null
  obsazeno: number
  urgentBadge?: "dnes" | "zitra" | "za_3_dny"
}

export interface DashboardAlert {
  key: AlertFilterKey | "dpp_tento_tyden"
  count: number
  label: string
  urgent: boolean
  /** Deep-link URL pro otevření filtrovaného seznamu. */
  href: string
}

export interface TeamSouhrn {
  /** Unikátní brigádníci v pipeline (stav IN zajemce/kontaktovan/prijaty_*).
   *  User feedback 22.4.: "nejsou to aktivní brigádníci, jen zájemci v databázi". */
  zajemciVDatabazi: number
  /** Brigádníci přiřazeni (status='prirazeny') na akci v budoucnu NEBO
   *  během posledních 6 měsíců. Distinct brigadnik_id. */
  aktivniBrigadnici: number
  akceTentoTyden: number
  bezDpp: number
  bezDotazniku: number
}

export type DashboardPayload =
  | {
      role: "admin"
      nadchazejici: NadchazejiciAkce[]
      alerts: DashboardAlert[]
      teamSouhrn: TeamSouhrn
    }
  | {
      role: "naborar"
      nadchazejici: NadchazejiciAkce[]
      alerts: DashboardAlert[]
      mojeHodiny: { placeholder: true }
    }

export interface NepodepsaneDppAkceItem {
  brigadnik_id: string
  jmeno: string
  prijmeni: string
  akce_id: string
  akce_nazev: string
  akce_datum: string
}

// ================================================================
// Helpers
// ================================================================

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function urgentBadge(
  dateStr: string
): "dnes" | "zitra" | "za_3_dny" | undefined {
  const d = daysUntil(dateStr)
  if (d === 0) return "dnes"
  if (d === 1) return "zitra"
  if (d >= 2 && d <= 3) return "za_3_dny"
  return undefined
}

// ================================================================
// Nadcházející akce s obsazeností (US-1A-1)
// ================================================================

export async function getNadchazejiciAkceWithObsazenost(
  limit: number = 8
): Promise<NadchazejiciAkce[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from("akce")
    .select("id, nazev, datum, cas_od, misto, pocet_lidi, nabidka_id")
    .eq("stav", "planovana")
    .gte("datum", today)
    .order("datum", { ascending: true })
    .order("cas_od", { ascending: true, nullsFirst: true })
    .limit(limit)

  if (error || !data) return []

  // QA fix (F-0017 PR post-merge review): obsazenost = POUZE status='prirazeny'.
  // Embed `prirazeni(count)` by ignoroval filter a zahrnul i náhradníky + odmítnuté,
  // což přecenilo progress bar. Separate query s .in() + .eq() guarantuje správný count.
  const akceIds = data.map(a => a.id)
  const obsazenostMap = new Map<string, number>()
  if (akceIds.length > 0) {
    const { data: prData } = await supabase
      .from("prirazeni")
      .select("akce_id")
      .in("akce_id", akceIds)
      .eq("status", "prirazeny")
    for (const p of prData ?? []) {
      obsazenostMap.set(p.akce_id, (obsazenostMap.get(p.akce_id) ?? 0) + 1)
    }
  }

  return data.map((a) => ({
    id: a.id,
    nazev: a.nazev,
    datum: a.datum,
    cas_od: a.cas_od,
    misto: a.misto,
    pocet_lidi: a.pocet_lidi,
    nabidka_id: a.nabidka_id,
    obsazeno: obsazenostMap.get(a.id) ?? 0,
    urgentBadge: urgentBadge(a.datum),
  }))
}

// ================================================================
// Nepodepsané DPP s akcí dnes/zítra/pozítří (US-1E-1)
// User feedback 22.4.: 3denní okno je urgentní (dnes/zítra/pozítří).
// 7denní scope byl moc volný — DPP za týden se stihne, dnes nestihne.
// ================================================================

export async function getNepodepsaneDppAkceTentoTyden(): Promise<{
  count: number
  items: NepodepsaneDppAkceItem[]
}> {
  const supabase = await createClient()
  const today = new Date()
  const threeDaysAhead = new Date(Date.now() + 2 * 86400000) // today + 2 = dnes/zítra/pozítří (3 dny včetně dneška)
  const todayStr = today.toISOString().slice(0, 10)
  const windowStr = threeDaysAhead.toISOString().slice(0, 10)

  // 1) Načti akce v okně dnes/zítra/pozítří se statusem planovana
  const { data: akceRows } = await supabase
    .from("akce")
    .select("id, nazev, datum")
    .eq("stav", "planovana")
    .gte("datum", todayStr)
    .lte("datum", windowStr)

  if (!akceRows || akceRows.length === 0) {
    return { count: 0, items: [] }
  }

  const akceIds = akceRows.map((a) => a.id)
  const akceMap = new Map(akceRows.map((a) => [a.id, a]))

  // 2) Najdi prirazeni × brigadnici pro tyto akce
  const { data: prirazeniRows } = await supabase
    .from("prirazeni")
    .select(
      "akce_id, brigadnik_id, brigadnik:brigadnici(id, jmeno, prijmeni, typ_brigadnika)"
    )
    .in("akce_id", akceIds)
    .eq("status", "prirazeny")

  if (!prirazeniRows || prirazeniRows.length === 0) {
    return { count: 0, items: [] }
  }

  // Vyfiltruj jen brigadnik (ne osvc) a unikátní brigadnik_ids
  type PrRow = (typeof prirazeniRows)[number]
  const relevantPr = prirazeniRows.filter((p: PrRow) => {
    const b = Array.isArray(p.brigadnik) ? p.brigadnik[0] : p.brigadnik
    return b && (b as { typ_brigadnika?: string }).typ_brigadnika !== "osvc"
  })

  const brigadnikIds = Array.from(
    new Set(relevantPr.map((p) => p.brigadnik_id))
  )

  if (brigadnikIds.length === 0) return { count: 0, items: [] }

  // 3) Načti smluvni_stav pro aktuální rok — kdo nemá podepsanou DPP
  const rok = new Date().getFullYear()
  const { data: ssRows } = await supabase
    .from("smluvni_stav")
    .select("brigadnik_id, dpp_stav")
    .in("brigadnik_id", brigadnikIds)
    .eq("rok", rok)

  const dppMap = new Map<string, string>()
  for (const s of ssRows ?? []) {
    dppMap.set(s.brigadnik_id, s.dpp_stav)
  }

  // Nepodepsané = dpp_stav != 'podepsano' (null / zadny / odeslano / ukoncena)
  const items: NepodepsaneDppAkceItem[] = []
  const seen = new Set<string>()

  for (const p of relevantPr) {
    const stav = dppMap.get(p.brigadnik_id) ?? "zadny"
    if (stav === "podepsano") continue

    const b = Array.isArray(p.brigadnik) ? p.brigadnik[0] : p.brigadnik
    if (!b) continue
    const akce = akceMap.get(p.akce_id)
    if (!akce) continue

    const dedupKey = `${p.brigadnik_id}:${p.akce_id}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)

    items.push({
      brigadnik_id: p.brigadnik_id,
      jmeno: (b as { jmeno: string }).jmeno,
      prijmeni: (b as { prijmeni: string }).prijmeni,
      akce_id: p.akce_id,
      akce_nazev: akce.nazev,
      akce_datum: akce.datum,
    })
  }

  items.sort((a, b) => a.akce_datum.localeCompare(b.akce_datum))

  return { count: items.length, items }
}

// ================================================================
// Dashboard Alerts — sdílí predicate s getBrigadnici (count parity)
// ================================================================

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  // Jeden fetch enriched brigádníků, pak 4× predicate (in-memory).
  // Acceptable < 2000 rows (architect 3.2 measurement).
  const brigadnici = await getBrigadnici()

  const alerts: DashboardAlert[] = ALERT_FILTER_KEYS.map((key) => {
    const pred = buildDokumentacniPredicate(key)
    const count = (brigadnici as EnrichedBrigadnikForFilter[]).filter(pred)
      .length
    return {
      key,
      count,
      label: FILTER_KEY_LABELS[key],
      urgent: false,
      href: `/app/brigadnici?filter=${key}`,
    }
  })

  // US-1E-1: urgentní alert „Nepodepsané DPP s akcí dnes/zítra/pozítří"
  // User feedback 22.4.: 3denní okno (bylo 7).
  const urgent = await getNepodepsaneDppAkceTentoTyden()
  if (urgent.count > 0) {
    alerts.unshift({
      key: "dpp_tento_tyden",
      count: urgent.count,
      label: "Nepodepsaná DPP + akce dnes/zítra/pozítří",
      urgent: true,
      href: "/app/brigadnici?filter=bez_dpp",
    })
  }

  // Skryj 0-count alerts (kromě urgent). „Vše v pořádku" fallback si řeší FE.
  return alerts.filter((a) => a.count > 0)
}

// ================================================================
// Team souhrn — admin-only
// ================================================================

export async function getTeamSouhrn(): Promise<TeamSouhrn> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const weekAhead = new Date(Date.now() + 7 * 86400000)
    .toISOString()
    .slice(0, 10)
  const sixMonthsAgo = new Date(Date.now() - 182 * 86400000)
    .toISOString()
    .slice(0, 10)

  // User feedback 22.4.:
  //  - "zájemci v databázi" = unique pipeline.brigadnik_id kde stav ∈
  //    {zajemce, kontaktovan, prijaty_nehotova_admin, prijaty_vse_vyreseno}.
  //  - "aktivní brigádníci" = unique prirazeni.brigadnik_id se status='prirazeny'
  //    JOIN akce kde akce.datum ∈ [today-6m, ∞) (min. někdy obsazen).
  const [
    zajemciRows,
    aktivniRows,
    { count: akceTentoTyden },
    enrichedForDpp,
  ] = await Promise.all([
    supabase
      .from("pipeline_entries")
      .select("brigadnik_id")
      .in("stav", [
        "zajemce",
        "kontaktovan",
        "prijaty_nehotova_admin",
        "prijaty_vse_vyreseno",
      ]),
    supabase
      .from("prirazeni")
      .select("brigadnik_id, akce:akce!inner(datum)")
      .eq("status", "prirazeny")
      .gte("akce.datum", sixMonthsAgo),
    supabase
      .from("akce")
      .select("id", { count: "exact", head: true })
      .eq("stav", "planovana")
      .gte("datum", today)
      .lte("datum", weekAhead),
    getBrigadnici(),
  ])

  const zajemciVDatabazi = new Set(
    (zajemciRows.data ?? []).map((r) => (r as { brigadnik_id: string }).brigadnik_id),
  ).size
  const aktivniBrigadnici = new Set(
    (aktivniRows.data ?? []).map((r) => (r as { brigadnik_id: string }).brigadnik_id),
  ).size

  // bez_dpp / bez_dotazniku: sdílený predikát, jen pocet_akci > 0 (obsazení).
  const enriched = enrichedForDpp as EnrichedBrigadnikForFilter[]
  const bezDpp = enriched.filter(buildDokumentacniPredicate("bez_dpp")).length
  const bezDotazniku = enriched.filter(
    buildDokumentacniPredicate("bez_dotazniku"),
  ).length

  return {
    zajemciVDatabazi,
    aktivniBrigadnici,
    akceTentoTyden: akceTentoTyden ?? 0,
    bezDpp,
    bezDotazniku,
  }
}

// ================================================================
// getDashboardData v2 — role-aware
// ================================================================

/**
 * F-0017 — role-aware dashboard payload.
 *
 * @param role - Z `users.role` lookup v calling page (admin vs naborar).
 *
 * Admin: nadchazejici + alerts + teamSouhrn
 * Náborářka: nadchazejici + alerts + mojeHodiny placeholder (F-0019 hook)
 *
 * Security-in-depth: náborářka nikdy nedostane `teamSouhrn` v payloadu
 * (discriminated union na TS úrovni + role check na BE).
 */
export async function getDashboardDataV2(
  role: UserRole
): Promise<DashboardPayload> {
  const [nadchazejici, alerts] = await Promise.all([
    getNadchazejiciAkceWithObsazenost(8),
    getDashboardAlerts(),
  ])

  if (role === "admin") {
    const teamSouhrn = await getTeamSouhrn()
    return { role: "admin", nadchazejici, alerts, teamSouhrn }
  }

  return {
    role: "naborar",
    nadchazejici,
    alerts,
    mojeHodiny: { placeholder: true },
  }
}

// F-0020 cleanup: legacy `getDashboardData` smazán — nahrazeno `getDashboardDataV2(role)`.

/**
 * Resolve current user's role for dashboard branching.
 * Returns null if user not authenticated or role missing.
 *
 * Používá admin client fallback (RLS pattern z F-0013 HF4c) — users řádek
 * může být nedostupný přes regular client RLS pro náborářku.
 */
export async function getCurrentUserRole(): Promise<{
  userId: string
  role: UserRole
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single()

  if (!data) return null
  const role = (data as { role: string }).role
  if (role !== "admin" && role !== "naborar") return null

  return { userId: (data as { id: string }).id, role: role as UserRole }
}
