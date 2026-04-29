"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getVocativeName } from "@/lib/utils/vocative"
import { resolveInternalUser, resolveInternalUserId } from "@/lib/utils/internal-user"
import { normalizeTime } from "@/lib/utils/time"
import { z } from "zod"

const akceSchema = z.object({
  nazev: z.string().min(1, "Název je povinný"),
  datum: z.string().min(1, "Datum je povinné"),
  misto: z.string().min(1, "Místo je povinné"),
  cas_od: z.string().optional(),
  cas_do: z.string().optional(),
  klient: z.string().optional(),
  nabidka_id: z.string().optional(),
  // Team roles & rates: pocet_lidi je v DB GENERATED (součet níže), do INSERT
  // se neposílá. UI ho zatím může poslat — ignorujeme.
  pocet_brigadniku: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
  pocet_koordinatoru: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
  poznamky: z.string().optional(),
})

// F-0015 — Zod enums
const stavEnum = z.enum(["planovana", "probehla", "zrusena"])
const stavFilterEnum = z.enum(["planovana", "probehla", "zrusena", "all"])

// F-0015 — Allowlist pro updateAkce na probehla (D-05)
const probehlaAllowlist = z.object({
  poznamky: z.string().optional(),
  pocet_brigadniku: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
  pocet_koordinatoru: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
})

// F-0015 — plný update schema pro planovana
const updateAkceFullSchema = z.object({
  nazev: z.string().min(1, "Název je povinný").optional(),
  datum: z.string().min(1, "Datum je povinné").optional(),
  misto: z.string().optional(),
  cas_od: z.string().optional(),
  cas_do: z.string().optional(),
  klient: z.string().optional(),
  pocet_brigadniku: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
  pocet_koordinatoru: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
  poznamky: z.string().optional(),
})

// F-0021b: PIN se generuje se současným bcrypt hashem (dual-write).
// Plaintext zůstává (pin_kod) pro legacy koordinátory / QR odkazy dokud
// nebude backfill kompletní. hash (pin_hash) se používá pro verify první.
import { generatePinPair } from "@/lib/utils/pin"

// ================================================================
// F-0015 — Lazy auto-transition planovana → probehla
// In-memory rate limit 5 min (pattern z F-0012 autoUkoncitJednodenniBatch).
// Volá se v getAkce() loader fire-and-forget.
// ================================================================

let lastAutoUkoncitAkceAt: number | null = null
const AUTO_UKONCIT_AKCE_TTL_MS = 5 * 60 * 1000

export async function autoUkoncitProbeleAkceBatch(): Promise<{ count: number; rateLimited?: boolean }> {
  if (lastAutoUkoncitAkceAt && Date.now() - lastAutoUkoncitAkceAt < AUTO_UKONCIT_AKCE_TTL_MS) {
    return { count: 0, rateLimited: true }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("fn_auto_ukoncit_probele_akce")
  if (error) {
    // best-effort — žádný throw, loader musí pokračovat
    return { count: 0 }
  }
  lastAutoUkoncitAkceAt = Date.now()
  return { count: typeof data === "number" ? data : 0 }
}

// ================================================================
// F-0015 — getAkce s filter/sort per-tab (ADR-1A, ADR-1B)
// ================================================================

export async function getAkce(filter?: {
  stav?: "planovana" | "probehla" | "zrusena" | "all"
  mesic?: string
  limit?: number
  offset?: number
}) {
  // Lazy auto-batch (fire-and-forget — neblokuje loader)
  autoUkoncitProbeleAkceBatch().catch(() => {})

  const supabase = await createClient()

  // Enum validation — fallback na 'planovana' pro invalid input (URL manipulation safety)
  const parsedStav = filter?.stav ? stavFilterEnum.safeParse(filter.stav) : null
  const stav = parsedStav?.success ? parsedStav.data : "planovana"
  const limit = Math.min(Math.max(filter?.limit ?? 30, 1), 1000)
  const offset = Math.max(filter?.offset ?? 0, 0)

  // Pro listing potřebujeme počítat obsazenost per role JEN ze status='prirazeny'
  // (náhradníci a vypadlí se nezapočítávají). Načteme detail přiřazení a počítáme client-side.
  let query = supabase
    .from("akce")
    .select("*, nabidka:nabidky(id, nazev), prirazeni(id, role, status)", { count: "exact" })

  // Per-tab WHERE
  if (stav !== "all") {
    query = query.eq("stav", stav)
  }

  // Per-tab sort (ADR-1B)
  // NULLS handling: v ASC nulls first (neznámý čas → nahoru), v DESC nulls last.
  if (stav === "planovana" || stav === "all") {
    query = query.order("datum", { ascending: true }).order("cas_od", { ascending: true, nullsFirst: true })
  } else if (stav === "probehla") {
    query = query.order("datum", { ascending: false }).order("cas_od", { ascending: false, nullsFirst: false })
  } else {
    // zrusena
    query = query.order("datum", { ascending: false })
  }

  // Legacy mesic filter (zpětná kompatibilita, UI nepoužívá)
  if (filter?.mesic) {
    const start = `${filter.mesic}-01`
    const [y, m] = filter.mesic.split("-").map(Number)
    const nextM = (m ?? 0) === 12 ? 1 : (m ?? 0) + 1
    const nextY = (m ?? 0) === 12 ? (y ?? 0) + 1 : (y ?? 0)
    const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`
    query = query.gte("datum", start).lt("datum", end)
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error
  return { data: data ?? [], totalCount: count ?? 0 }
}

// ================================================================
// F-0015 — getAkceCounts (1 GROUP BY dotaz, SSR tab badges)
// ================================================================

export async function getAkceCounts(): Promise<{
  planovana: number
  probehla: number
  zrusena: number
  all: number
}> {
  const supabase = await createClient()
  // Supabase JS neumí GROUP BY bez RPC — použijeme 3 lightweight head-count dotazy.
  // < 1000 rows × 3 = trivial overhead, lepší než non-indexed full scan s group by přes SQL view.
  const [pla, pro, zru] = await Promise.all([
    supabase.from("akce").select("id", { count: "exact", head: true }).eq("stav", "planovana"),
    supabase.from("akce").select("id", { count: "exact", head: true }).eq("stav", "probehla"),
    supabase.from("akce").select("id", { count: "exact", head: true }).eq("stav", "zrusena"),
  ])
  const planovana = pla.count ?? 0
  const probehla = pro.count ?? 0
  const zrusena = zru.count ?? 0
  return { planovana, probehla, zrusena, all: planovana + probehla + zrusena }
}

// ================================================================
// F-0015 — Matrix dokumentační status (ADR-1F)
// ================================================================

export async function getMatrixDokumentacniStatus(
  nabidkaId: string
): Promise<Record<string, string>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("v_brigadnik_zakazka_status")
    .select("brigadnik_id, dokumentacni_stav")
    .eq("nabidka_id", nabidkaId)

  if (error) return {}
  const map: Record<string, string> = {}
  for (const row of (data ?? []) as Array<{ brigadnik_id: string; dokumentacni_stav: string }>) {
    map[row.brigadnik_id] = row.dokumentacni_stav
  }
  return map
}

export async function getAkceByNabidka(nabidkaId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("akce")
    .select("*, prirazeni(id, brigadnik_id, role, status, brigadnik:brigadnici(id, jmeno, prijmeni))")
    .eq("nabidka_id", nabidkaId)
    .order("datum", { ascending: true })
  return data ?? []
}

export async function createAkce(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  // Strip legacy pocet_lidi (GENERATED v DB) — UI nemá posílat, ale starší
  // verze mohly ještě mít pole. Bez stripu by `.strict()` schema spadla.
  const { pocet_lidi: _legacyPocetLidi, ...rawClean } =
    Object.fromEntries(formData.entries()) as Record<string, unknown>
  void _legacyPocetLidi
  const parsed = akceSchema.safeParse(rawClean)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  // F-0012 guards
  if (parsed.data.nabidka_id) {
    const { data: nabidka } = await supabase
      .from("nabidky")
      .select("typ")
      .eq("id", parsed.data.nabidka_id)
      .single()

    if (!nabidka) return { error: "Zakázka nenalezena" }
    if (nabidka.typ === "ukoncena") {
      return { error: "K ukončené zakázce nelze přidávat akce" }
    }
    if (nabidka.typ === "jednodenni") {
      const { count } = await supabase
        .from("akce")
        .select("id", { count: "exact", head: true })
        .eq("nabidka_id", parsed.data.nabidka_id)
      if ((count ?? 0) >= 1) {
        return { error: "Jednodenní zakázka už má svoji akci. Vytvořte opakovanou zakázku pro více akcí." }
      }
    }
  }

  // F-0021b: dual-write PIN (plaintext + bcrypt hash).
  // pocet_lidi je GENERATED v DB — NEzapisuj. pocet_brigadniku/koordinatoru
  // defaultujeme na 0, pokud UI nepošle (legacy formy).
  const pinPair = await generatePinPair()
  const { data: inserted, error } = await supabase.from("akce").insert({
    ...parsed.data,
    cas_od: normalizeTime(parsed.data.cas_od),
    cas_do: normalizeTime(parsed.data.cas_do),
    nabidka_id: parsed.data.nabidka_id || null,
    pocet_brigadniku: parsed.data.pocet_brigadniku ?? 0,
    pocet_koordinatoru: parsed.data.pocet_koordinatoru ?? 0,
    pin_kod: pinPair.plaintext,
    pin_hash: pinPair.hash,
  }).select("id").single()

  if (error) return { error: error.message }

  // Audit log
  const { data: internalUser } = await supabase
    .from("users").select("id").eq("auth_user_id", user.id).single()
  await supabase.from("historie").insert({
    akce_id: inserted?.id,
    nabidka_id: parsed.data.nabidka_id || null,
    user_id: internalUser?.id,
    typ: "akce_vytvorena",
    popis: `Vytvořena akce "${parsed.data.nazev}" (${parsed.data.datum})`,
  })

  revalidatePath("/app/akce")
  if (parsed.data.nabidka_id) revalidatePath(`/app/nabidky/${parsed.data.nabidka_id}`)
  return { success: true, id: inserted?.id }
}

export async function getAkceById(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("akce")
    .select("*, nabidka:nabidky(id, nazev)")
    .eq("id", id)
    .single()
  return data
}

export async function getAkcePrirazeni(akceId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("prirazeni")
    .select(`
      *,
      brigadnik:brigadnici(id, jmeno, prijmeni, telefon, email),
      dochazka(id, prichod, odchod, hodin_celkem, hodnoceni, poznamka)
    `)
    .eq("akce_id", akceId)
    .order("status", { ascending: true })
    .order("poradi_nahradnik", { ascending: true })

  return data ?? []
}

/**
 * PR C — addPrirazeni s role + status + snapshot sazby.
 *
 * Pravidla (Michal):
 *  - status='prirazeny' MUSÍ mít role; sazba se snapshotuje ze zakázky podle role.
 *  - status='nahradnik' je univerzální — role NULL, sazba NULL. Role/sazba se
 *    určí až při povýšení (povysitNahradnika).
 *  - Limit kapacity: 'prirazeny' s konkrétní rolí nesmí přesáhnout
 *    akce.pocet_brigadniku resp. akce.pocet_koordinatoru. Náhradníky neomezujeme.
 *  - Koordinátor jen pokud nabidka.sazba_koordinator IS NOT NULL.
 *  - Editace jen pro akce.stav='planovana'.
 */
export async function addPrirazeni(args: {
  akceId: string
  brigadnikId: string
  status: "prirazeny" | "nahradnik"
  role?: "brigadnik" | "koordinator"
}): Promise<{ success: true } | { error: string }> {
  const { akceId, brigadnikId, status, role } = args
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  // Role check (admin nebo naborar) — resolveInternalUser
  const internalUser = await resolveInternalUser(user.id, user.email)
  if (!internalUser) return { error: "Interní uživatel nenalezen — zkontrolujte propojení účtu (kód U2)" }
  if (!["admin", "naborar"].includes(internalUser.role)) {
    return { error: "Nemáte oprávnění přiřazovat brigádníky" }
  }

  // Načti akci + zakázku
  const { data: akce } = await supabase
    .from("akce")
    .select("id, nazev, stav, nabidka_id, pocet_brigadniku, pocet_koordinatoru")
    .eq("id", akceId)
    .single()
  if (!akce) return { error: "Akce nenalezena" }
  if (akce.stav !== "planovana") {
    return { error: `Akci nelze upravovat (status: ${akce.stav})` }
  }

  const insertRow: Record<string, unknown> = {
    akce_id: akceId,
    brigadnik_id: brigadnikId,
    status,
  }

  if (status === "prirazeny") {
    if (!role) return { error: "Pro přiřazeného je třeba vybrat roli" }

    // Načti zakázku kvůli sazbám
    let sazbaBrigadnik: number | null = null
    let sazbaKoordinator: number | null = null
    if (akce.nabidka_id) {
      const { data: nabidka } = await supabase
        .from("nabidky")
        .select("sazba_brigadnik, sazba_koordinator")
        .eq("id", akce.nabidka_id)
        .single()
      sazbaBrigadnik = (nabidka as { sazba_brigadnik?: number | null } | null)?.sazba_brigadnik ?? null
      sazbaKoordinator = (nabidka as { sazba_koordinator?: number | null } | null)?.sazba_koordinator ?? null
    }

    if (role === "koordinator" && sazbaKoordinator == null) {
      return { error: "Tato zakázka nemá povoleného koordinátora" }
    }

    // Kapacita check
    const { count } = await supabase
      .from("prirazeni")
      .select("id", { count: "exact", head: true })
      .eq("akce_id", akceId)
      .eq("status", "prirazeny")
      .eq("role", role)
    const limit = role === "koordinator"
      ? (akce.pocet_koordinatoru ?? 0)
      : (akce.pocet_brigadniku ?? 0)
    if ((count ?? 0) >= limit) {
      return {
        error: role === "koordinator"
          ? "Kapacita koordinátorů je již plná"
          : "Kapacita brigádníků je již plná",
      }
    }

    insertRow.role = role
    insertRow.sazba_hodinova = role === "koordinator" ? sazbaKoordinator : sazbaBrigadnik
  } else {
    // nahradnik — universal
    insertRow.role = null
    insertRow.sazba_hodinova = null
    // poradi_nahradnik = max + 1
    const { data: existingNahr } = await supabase
      .from("prirazeni")
      .select("poradi_nahradnik")
      .eq("akce_id", akceId)
      .eq("status", "nahradnik")
      .order("poradi_nahradnik", { ascending: false })
      .limit(1)
    const maxPoradi = (existingNahr?.[0] as { poradi_nahradnik?: number | null } | undefined)?.poradi_nahradnik ?? 0
    insertRow.poradi_nahradnik = maxPoradi + 1
  }

  const { error } = await supabase.from("prirazeni").insert(insertRow)
  if (error) {
    if (error.code === "23505") return { error: "Brigádník je již přiřazený na tuto akci" }
    return { error: error.message }
  }

  // Audit
  const { data: brigadnik } = await supabase
    .from("brigadnici")
    .select("jmeno, prijmeni")
    .eq("id", brigadnikId)
    .single()

  const roleLabel = status === "nahradnik"
    ? "náhradník"
    : role === "koordinator" ? "koordinátor" : "brigádník"

  await supabase.from("historie").insert({
    brigadnik_id: brigadnikId,
    akce_id: akceId,
    nabidka_id: akce.nabidka_id,
    user_id: internalUser.id,
    typ: "prirazeni_pridano",
    popis: `${brigadnik?.prijmeni ?? ""} ${brigadnik?.jmeno ?? ""} přidán/a na akci "${akce.nazev}" jako ${roleLabel}`,
    metadata: { status, role: insertRow.role, sazba: insertRow.sazba_hodinova },
  })

  revalidatePath(`/app/akce/${akceId}`)
  if (akce.nabidka_id) revalidatePath(`/app/nabidky/${akce.nabidka_id}`)
  return { success: true }
}

/**
 * PR C — Změna role přiřazeného brigádníka (toggle B↔K).
 * Sazba se VŽDY přepíše ze zakázky podle nové role.
 */
export async function updatePrirazeniRole(
  prirazeniId: string,
  newRole: "brigadnik" | "koordinator"
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const internalUser = await resolveInternalUser(user.id, user.email)
  if (!internalUser) return { error: "Interní uživatel nenalezen (kód U2)" }
  if (!["admin", "naborar"].includes(internalUser.role)) {
    return { error: "Nemáte oprávnění měnit roli" }
  }

  const { data: prir } = await supabase
    .from("prirazeni")
    .select("id, akce_id, brigadnik_id, role, status, sazba_hodinova")
    .eq("id", prirazeniId)
    .single()
  if (!prir) return { error: "Přiřazení nenalezeno" }

  if (prir.status !== "prirazeny") {
    return { error: "Roli lze měnit jen u přiřazeného brigádníka, ne u náhradníka/vypadlého" }
  }

  const { data: akce } = await supabase
    .from("akce")
    .select("id, stav, nabidka_id, pocet_brigadniku, pocet_koordinatoru")
    .eq("id", prir.akce_id)
    .single()
  if (!akce) return { error: "Akce nenalezena" }
  if (akce.stav !== "planovana") {
    return { error: `Akci nelze upravovat (status: ${akce.stav})` }
  }

  if (prir.role === newRole) {
    return { success: true }
  }

  // Načti sazby
  let sazbaBrigadnik: number | null = null
  let sazbaKoordinator: number | null = null
  if (akce.nabidka_id) {
    const { data: nabidka } = await supabase
      .from("nabidky")
      .select("sazba_brigadnik, sazba_koordinator")
      .eq("id", akce.nabidka_id)
      .single()
    sazbaBrigadnik = (nabidka as { sazba_brigadnik?: number | null } | null)?.sazba_brigadnik ?? null
    sazbaKoordinator = (nabidka as { sazba_koordinator?: number | null } | null)?.sazba_koordinator ?? null
  }

  if (newRole === "koordinator" && sazbaKoordinator == null) {
    return { error: "Tato zakázka nemá povoleného koordinátora" }
  }

  // Kapacita pro newRole
  const { count } = await supabase
    .from("prirazeni")
    .select("id", { count: "exact", head: true })
    .eq("akce_id", prir.akce_id)
    .eq("status", "prirazeny")
    .eq("role", newRole)
  const limit = newRole === "koordinator"
    ? (akce.pocet_koordinatoru ?? 0)
    : (akce.pocet_brigadniku ?? 0)
  if ((count ?? 0) >= limit) {
    return {
      error: newRole === "koordinator"
        ? "Kapacita koordinátorů je již plná"
        : "Kapacita brigádníků je již plná",
    }
  }

  const novaSazba = newRole === "koordinator" ? sazbaKoordinator : sazbaBrigadnik

  const { error: updErr } = await supabase
    .from("prirazeni")
    .update({ role: newRole, sazba_hodinova: novaSazba })
    .eq("id", prirazeniId)
  if (updErr) return { error: updErr.message }

  // Audit
  await supabase.from("historie").insert({
    brigadnik_id: prir.brigadnik_id,
    akce_id: prir.akce_id,
    nabidka_id: akce.nabidka_id,
    user_id: internalUser.id,
    typ: "prirazeni_role_zmena",
    popis: `Role změněna ${prir.role ?? "—"} → ${newRole}`,
    metadata: {
      role_before: prir.role,
      role_after: newRole,
      sazba_before: prir.sazba_hodinova,
      sazba_after: novaSazba,
    },
  })

  revalidatePath(`/app/akce/${prir.akce_id}`)
  if (akce.nabidka_id) revalidatePath(`/app/nabidky/${akce.nabidka_id}`)
  return { success: true }
}

/**
 * Ruční úprava sazby na řádku přiřazení.
 * - Jen u status='prirazeny' a planované akce.
 * - Hodnota 0 — 9999 Kč/h, NULL = vymazat (vrátit „bez sazby").
 * - Audit log do historie.
 */
export async function updatePrirazeniSazba(
  prirazeniId: string,
  novaSazba: number | null
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const internalUser = await resolveInternalUser(user.id, user.email)
  if (!internalUser) return { error: "Interní uživatel nenalezen (kód U2)" }
  if (!["admin", "naborar"].includes(internalUser.role)) {
    return { error: "Nemáte oprávnění měnit sazbu" }
  }

  // Validace
  if (novaSazba != null) {
    if (!Number.isFinite(novaSazba) || novaSazba < 0 || novaSazba > 9999) {
      return { error: "Sazba musí být mezi 0 a 9999 Kč/h" }
    }
    novaSazba = Math.round(novaSazba * 100) / 100 // 2 desetinná místa
  }

  const { data: prir } = await supabase
    .from("prirazeni")
    .select("id, akce_id, brigadnik_id, role, status, sazba_hodinova")
    .eq("id", prirazeniId)
    .single()
  if (!prir) return { error: "Přiřazení nenalezeno" }

  if (prir.status !== "prirazeny") {
    return { error: "Sazbu lze měnit jen u přiřazeného brigádníka" }
  }

  const { data: akce } = await supabase
    .from("akce")
    .select("id, stav, nabidka_id")
    .eq("id", prir.akce_id)
    .single()
  if (!akce) return { error: "Akce nenalezena" }
  if (akce.stav !== "planovana") {
    return { error: "Sazbu nelze měnit u proběhlé/zrušené akce" }
  }

  if (prir.sazba_hodinova === novaSazba) {
    return { success: true }
  }

  const { error: updErr } = await supabase
    .from("prirazeni")
    .update({ sazba_hodinova: novaSazba })
    .eq("id", prirazeniId)
  if (updErr) return { error: updErr.message }

  await supabase.from("historie").insert({
    brigadnik_id: prir.brigadnik_id,
    akce_id: prir.akce_id,
    nabidka_id: akce.nabidka_id,
    user_id: internalUser.id,
    typ: "prirazeni_sazba_zmena",
    popis: `Sazba změněna ${prir.sazba_hodinova ?? "—"} → ${novaSazba ?? "—"} Kč/h`,
    metadata: {
      sazba_before: prir.sazba_hodinova,
      sazba_after: novaSazba,
    },
  })

  revalidatePath(`/app/akce/${prir.akce_id}`)
  if (akce.nabidka_id) revalidatePath(`/app/nabidky/${akce.nabidka_id}`)
  return { success: true }
}

/**
 * PR C — Povýšit náhradníka na přiřazeného (B nebo K).
 * Sazba se snapshotuje ze zakázky podle zvolené role.
 */
export async function povysitNahradnika(
  prirazeniId: string,
  newRole: "brigadnik" | "koordinator"
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const internalUser = await resolveInternalUser(user.id, user.email)
  if (!internalUser) return { error: "Interní uživatel nenalezen (kód U2)" }
  if (!["admin", "naborar"].includes(internalUser.role)) {
    return { error: "Nemáte oprávnění povyšovat náhradníky" }
  }

  const { data: prir } = await supabase
    .from("prirazeni")
    .select("id, akce_id, brigadnik_id, role, status, poradi_nahradnik")
    .eq("id", prirazeniId)
    .single()
  if (!prir) return { error: "Přiřazení nenalezeno" }
  if (prir.status !== "nahradnik") {
    return { error: "Tento brigádník není náhradník" }
  }

  const { data: akce } = await supabase
    .from("akce")
    .select("id, stav, nabidka_id, pocet_brigadniku, pocet_koordinatoru")
    .eq("id", prir.akce_id)
    .single()
  if (!akce) return { error: "Akce nenalezena" }
  if (akce.stav !== "planovana") {
    return { error: `Akci nelze upravovat (status: ${akce.stav})` }
  }

  // Načti sazby
  let sazbaBrigadnik: number | null = null
  let sazbaKoordinator: number | null = null
  if (akce.nabidka_id) {
    const { data: nabidka } = await supabase
      .from("nabidky")
      .select("sazba_brigadnik, sazba_koordinator")
      .eq("id", akce.nabidka_id)
      .single()
    sazbaBrigadnik = (nabidka as { sazba_brigadnik?: number | null } | null)?.sazba_brigadnik ?? null
    sazbaKoordinator = (nabidka as { sazba_koordinator?: number | null } | null)?.sazba_koordinator ?? null
  }

  if (newRole === "koordinator" && sazbaKoordinator == null) {
    return { error: "Tato zakázka nemá povoleného koordinátora" }
  }

  const { count } = await supabase
    .from("prirazeni")
    .select("id", { count: "exact", head: true })
    .eq("akce_id", prir.akce_id)
    .eq("status", "prirazeny")
    .eq("role", newRole)
  const limit = newRole === "koordinator"
    ? (akce.pocet_koordinatoru ?? 0)
    : (akce.pocet_brigadniku ?? 0)
  if ((count ?? 0) >= limit) {
    return {
      error: newRole === "koordinator"
        ? "Kapacita koordinátorů je již plná"
        : "Kapacita brigádníků je již plná",
    }
  }

  const novaSazba = newRole === "koordinator" ? sazbaKoordinator : sazbaBrigadnik

  const { error: updErr } = await supabase
    .from("prirazeni")
    .update({
      status: "prirazeny",
      role: newRole,
      sazba_hodinova: novaSazba,
    })
    .eq("id", prirazeniId)
  if (updErr) return { error: updErr.message }

  // Audit
  const { data: brigadnik } = await supabase
    .from("brigadnici")
    .select("jmeno, prijmeni")
    .eq("id", prir.brigadnik_id)
    .single()

  await supabase.from("historie").insert({
    brigadnik_id: prir.brigadnik_id,
    akce_id: prir.akce_id,
    nabidka_id: akce.nabidka_id,
    user_id: internalUser.id,
    typ: "nahradnik_povysen",
    popis: `${brigadnik?.prijmeni ?? ""} ${brigadnik?.jmeno ?? ""} povýšen/a z náhradníků jako ${newRole === "koordinator" ? "koordinátor" : "brigádník"}`,
    metadata: {
      from_status: "nahradnik",
      from_poradi: prir.poradi_nahradnik,
      to_role: newRole,
      sazba: novaSazba,
    },
  })

  revalidatePath(`/app/akce/${prir.akce_id}`)
  if (akce.nabidka_id) revalidatePath(`/app/nabidky/${akce.nabidka_id}`)
  return { success: true }
}

/**
 * Přesun přiřazeného brigádníka do náhradníků.
 * - role/sazba se nuluje (universal nahradnik)
 * - poradi_nahradnik = max+1
 * - případnou docházku (prichod/odchod) vyčistíme — nedává smysl pro náhradníka
 */
export async function presunoutDoNahradniku(
  prirazeniId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const internalUser = await resolveInternalUser(user.id, user.email)
  if (!internalUser) return { error: "Interní uživatel nenalezen (kód U2)" }
  if (!["admin", "naborar"].includes(internalUser.role)) {
    return { error: "Nemáte oprávnění upravovat přiřazení" }
  }

  const { data: prir } = await supabase
    .from("prirazeni")
    .select("id, akce_id, brigadnik_id, role, status")
    .eq("id", prirazeniId)
    .single()
  if (!prir) return { error: "Přiřazení nenalezeno" }

  const { data: akce } = await supabase
    .from("akce")
    .select("id, stav, nabidka_id")
    .eq("id", prir.akce_id)
    .single()
  if (!akce) return { error: "Akce nenalezena" }
  if (akce.stav !== "planovana") {
    return { error: `Akci nelze upravovat (status: ${akce.stav})` }
  }

  // Noop — už je náhradník
  if (prir.status === "nahradnik") return { success: true }

  const puvodniRole = prir.role

  // Spočítej max poradi_nahradnik
  const { data: existingNahr } = await supabase
    .from("prirazeni")
    .select("poradi_nahradnik")
    .eq("akce_id", prir.akce_id)
    .eq("status", "nahradnik")
    .order("poradi_nahradnik", { ascending: false })
    .limit(1)
  const maxPoradi = (existingNahr?.[0] as { poradi_nahradnik?: number | null } | undefined)?.poradi_nahradnik ?? 0

  const { error: updErr } = await supabase
    .from("prirazeni")
    .update({
      status: "nahradnik",
      role: null,
      sazba_hodinova: null,
      poradi_nahradnik: maxPoradi + 1,
    })
    .eq("id", prirazeniId)
  if (updErr) return { error: updErr.message }

  // Vyčisti docházku, pokud má vyplněný čas (admin client kvůli RLS)
  const admin = createAdminClient()
  const { data: existingDoch } = await admin
    .from("dochazka")
    .select("id, prichod, odchod")
    .eq("prirazeni_id", prirazeniId)
    .maybeSingle()
  if (existingDoch && (existingDoch.prichod || existingDoch.odchod)) {
    await admin
      .from("dochazka")
      .update({ prichod: null, odchod: null, hodin_celkem: null })
      .eq("id", existingDoch.id)
  }

  // Audit
  const { data: brigadnik } = await supabase
    .from("brigadnici")
    .select("jmeno, prijmeni")
    .eq("id", prir.brigadnik_id)
    .single()

  await supabase.from("historie").insert({
    brigadnik_id: prir.brigadnik_id,
    akce_id: prir.akce_id,
    nabidka_id: akce.nabidka_id,
    user_id: internalUser.id,
    typ: "prirazeni_do_nahradniku",
    popis: `${brigadnik?.prijmeni ?? ""} ${brigadnik?.jmeno ?? ""} přesunut/a do náhradníků (původní role: ${puvodniRole ?? "—"})`,
    metadata: {
      from_status: prir.status,
      from_role: puvodniRole,
      to_status: "nahradnik",
      poradi_nahradnik: maxPoradi + 1,
    },
  })

  revalidatePath(`/app/akce/${prir.akce_id}`)
  if (akce.nabidka_id) revalidatePath(`/app/nabidky/${akce.nabidka_id}`)
  return { success: true }
}

/**
 * Smaž přiřazení úplně (pro odstranění omylem přidaného náhradníka).
 * CASCADE smaže i dochazka řádek (FK ON DELETE CASCADE).
 */
export async function smazatPrirazeni(
  prirazeniId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const internalUser = await resolveInternalUser(user.id, user.email)
  if (!internalUser) return { error: "Interní uživatel nenalezen (kód U2)" }
  if (!["admin", "naborar"].includes(internalUser.role)) {
    return { error: "Nemáte oprávnění mazat přiřazení" }
  }

  const { data: prir } = await supabase
    .from("prirazeni")
    .select("id, akce_id, brigadnik_id, role, status")
    .eq("id", prirazeniId)
    .single()
  if (!prir) return { error: "Přiřazení nenalezeno" }

  const { data: akce } = await supabase
    .from("akce")
    .select("id, stav, nabidka_id, nazev")
    .eq("id", prir.akce_id)
    .single()
  if (!akce) return { error: "Akce nenalezena" }
  if (akce.stav !== "planovana") {
    return { error: `Akci nelze upravovat (status: ${akce.stav})` }
  }

  const { data: brigadnik } = await supabase
    .from("brigadnici")
    .select("jmeno, prijmeni")
    .eq("id", prir.brigadnik_id)
    .single()

  const { error: delErr } = await supabase
    .from("prirazeni")
    .delete()
    .eq("id", prirazeniId)
  if (delErr) return { error: delErr.message }

  // Audit (po smazání — prirazeni_id už neexistuje, ukládáme jen do popisu/metadata)
  await supabase.from("historie").insert({
    brigadnik_id: prir.brigadnik_id,
    akce_id: prir.akce_id,
    nabidka_id: akce.nabidka_id,
    user_id: internalUser.id,
    typ: "prirazeni_smazano",
    popis: `${brigadnik?.prijmeni ?? ""} ${brigadnik?.jmeno ?? ""} odebrán/a z akce "${akce.nazev}"`,
    metadata: {
      from_status: prir.status,
      from_role: prir.role,
    },
  })

  revalidatePath(`/app/akce/${prir.akce_id}`)
  if (akce.nabidka_id) revalidatePath(`/app/nabidky/${akce.nabidka_id}`)
  return { success: true }
}

/**
 * Wrappery pro markNepriselBrigadnik / undoNepriselBrigadnik volané z UI bez
 * znalosti interního user.id — admin si ho vytáhne z auth contextu sám.
 */
export async function oznacitNepriselFromAdmin(
  prirazeniId: string,
  duvod?: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }
  const internalUser = await resolveInternalUser(user.id, user.email)
  if (!internalUser) return { error: "Interní uživatel nenalezen (kód U2)" }
  if (!["admin", "naborar"].includes(internalUser.role)) {
    return { error: "Nemáte oprávnění" }
  }
  const { markNepriselBrigadnik } = await import("./dochazka")
  const result = await markNepriselBrigadnik(prirazeniId, { type: "admin", id: internalUser.id }, duvod)
  // dochazka.ts nedělá revalidatePath — uděláme to tady
  if ("success" in result) {
    const { data: prir } = await supabase
      .from("prirazeni")
      .select("akce_id, akce:akce(nabidka_id)")
      .eq("id", prirazeniId)
      .single()
    if (prir) {
      revalidatePath(`/app/akce/${prir.akce_id}`)
      const nab = (prir.akce as unknown as { nabidka_id?: string | null } | null)
      if (nab?.nabidka_id) revalidatePath(`/app/nabidky/${nab.nabidka_id}`)
    }
  }
  return result
}

export async function undoNepriselFromAdmin(
  prirazeniId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }
  const internalUser = await resolveInternalUser(user.id, user.email)
  if (!internalUser) return { error: "Interní uživatel nenalezen (kód U2)" }
  if (!["admin", "naborar"].includes(internalUser.role)) {
    return { error: "Nemáte oprávnění" }
  }
  const { undoNepriselBrigadnik } = await import("./dochazka")
  const result = await undoNepriselBrigadnik(prirazeniId, { type: "admin", id: internalUser.id })
  if ("success" in result) {
    const { data: prir } = await supabase
      .from("prirazeni")
      .select("akce_id, akce:akce(nabidka_id)")
      .eq("id", prirazeniId)
      .single()
    if (prir) {
      revalidatePath(`/app/akce/${prir.akce_id}`)
      const nab = (prir.akce as unknown as { nabidka_id?: string | null } | null)
      if (nab?.nabidka_id) revalidatePath(`/app/nabidky/${nab.nabidka_id}`)
    }
  }
  return result
}

// ================================================================
// F-0012: assign brigadnik from pipeline to akce (multi-container DnD)
// ================================================================

export async function assignBrigadnikToAkce(
  akceId: string,
  brigadnikId: string,
  // pozice param je legacy — sloupec byl DROP v migraci
  // 20260430000001_team_roles_and_rates. Hodnota se ignoruje, role se nastaví
  // až v PR B (UI pro výběr brigadnik/koordinator).
  _pozice?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  // Load akce + parent nabidka
  const { data: akce } = await supabase
    .from("akce")
    .select("id, nazev, nabidka_id, nabidka:nabidky(typ)")
    .eq("id", akceId)
    .single()

  if (!akce) return { error: "Akce nenalezena" }
  if (!akce.nabidka_id) return { error: "Akce není přiřazená k zakázce" }
  const nabidka = akce.nabidka as unknown as { typ: string } | null
  if (nabidka?.typ === "ukoncena") {
    return { error: "Ukončená zakázka — nelze přiřazovat brigádníky" }
  }

  // Pipeline guard — brigadnik musí být v pipeline téže zakázky a ve správném stavu
  const { data: pipelineEntry } = await supabase
    .from("pipeline_entries")
    .select("stav")
    .eq("brigadnik_id", brigadnikId)
    .eq("nabidka_id", akce.nabidka_id)
    .single()

  if (!pipelineEntry) {
    return { error: "Brigádník není v pipeline této zakázky" }
  }
  if (!["prijaty_nehotova_admin", "prijaty_vse_vyreseno"].includes(pipelineEntry.stav)) {
    return { error: "Brigádník musí být ve stavu 'Přijatý' než bude přiřazen na akci" }
  }

  // Insert přiřazení (silent no-op on duplicate). Default role 'brigadnik' —
  // PR B přidá UI pro výběr role koordinator.
  const { error } = await supabase.from("prirazeni").insert({
    akce_id: akceId,
    brigadnik_id: brigadnikId,
    role: "brigadnik",
    status: "prirazeny",
  })

  if (error) {
    if (error.code === "23505") {
      // Already assigned — silent
      return { success: true, duplicate: true }
    }
    return { error: error.message }
  }

  // Audit
  const { data: internalUser } = await supabase
    .from("users").select("id").eq("auth_user_id", user.id).single()
  const { data: brigadnik } = await supabase
    .from("brigadnici").select("jmeno, prijmeni").eq("id", brigadnikId).single()

  await supabase.from("historie").insert({
    brigadnik_id: brigadnikId,
    akce_id: akceId,
    nabidka_id: akce.nabidka_id,
    user_id: internalUser?.id,
    typ: "prirazeni_zmena",
    popis: `${brigadnik?.prijmeni} ${brigadnik?.jmeno} přiřazen/a na akci "${akce.nazev}"`,
  })

  revalidatePath(`/app/nabidky/${akce.nabidka_id}`)
  revalidatePath(`/app/akce/${akceId}`)
  return { success: true }
}

export async function unassignBrigadnikFromAkce(akceId: string, brigadnikId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { data: akce } = await supabase
    .from("akce").select("nazev, nabidka_id").eq("id", akceId).single()

  const { error } = await supabase
    .from("prirazeni")
    .delete()
    .eq("akce_id", akceId)
    .eq("brigadnik_id", brigadnikId)

  if (error) return { error: error.message }

  const { data: internalUser } = await supabase
    .from("users").select("id").eq("auth_user_id", user.id).single()
  const { data: brigadnik } = await supabase
    .from("brigadnici").select("jmeno, prijmeni").eq("id", brigadnikId).single()

  await supabase.from("historie").insert({
    brigadnik_id: brigadnikId,
    akce_id: akceId,
    nabidka_id: akce?.nabidka_id,
    user_id: internalUser?.id,
    typ: "prirazeni_zmena",
    popis: `${brigadnik?.prijmeni} ${brigadnik?.jmeno} odebrán/a z akce "${akce?.nazev}"`,
  })

  revalidatePath(`/app/akce/${akceId}`)
  if (akce?.nabidka_id) revalidatePath(`/app/nabidky/${akce.nabidka_id}`)
  return { success: true }
}

// ================================================================
// F-0012: briefing email (opt-in)
// ================================================================

export async function odeslatBriefing(akceId: string, briefingText?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { data: akce } = await supabase
    .from("akce")
    .select("id, nazev, datum, misto, nabidka_id, prirazeni(brigadnik:brigadnici(id, email, jmeno, prijmeni), role, status)")
    .eq("id", akceId)
    .single()

  if (!akce) return { error: "Akce nenalezena" }

  const prirazeni = (akce.prirazeni ?? []) as unknown as Array<{
    brigadnik: { id: string; email: string; jmeno: string; prijmeni: string } | null
    role: string | null
    status: string
  }>

  const recipients = prirazeni.filter(p => p.status === "prirazeny" && p.brigadnik?.email)

  if (recipients.length === 0) {
    return { error: "Žádní přiřazení brigádníci s emailem" }
  }

  // Fetch template
  const { data: sablona } = await supabase
    .from("email_sablony")
    .select("predmet, obsah_html")
    .eq("nazev", "Briefing pro akci")
    .eq("aktivni", true)
    .single()

  if (!sablona) {
    return { error: "Šablona 'Briefing pro akci' nenalezena. Spusťte migraci." }
  }

  // Best-effort send via Gmail API
  let sent = 0
  const errors: string[] = []
  try {
    const { sendGmailMessage } = await import("@/lib/email/gmail-send")
    for (const r of recipients) {
      const b = r.brigadnik!
      const vars: Record<string, string> = {
        jmeno: b.jmeno,
        osloveni: getVocativeName(b.jmeno),
        akce_nazev: akce.nazev,
        akce_datum: new Date(akce.datum).toLocaleDateString("cs-CZ"),
        akce_misto: akce.misto ?? "",
        // pozice template var: po team-roles migraci mapováno na role
        // ('brigadnik'/'koordinator'/''). Šablona může být upravena v PR B.
        pozice: r.role ?? "",
        briefing_text: briefingText ?? "",
      }
      const subject = sablona.predmet.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? "")
      const bodyHtml = sablona.obsah_html.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? "")
      try {
        await sendGmailMessage({ to: b.email, subject, bodyHtml })
        sent++
      } catch (err) {
        errors.push(`${b.email}: ${(err as Error).message}`)
      }
    }
  } catch {
    return { error: "Email klient není dostupný" }
  }

  // Audit
  const { data: internalUser } = await supabase
    .from("users").select("id").eq("auth_user_id", user.id).single()
  await supabase.from("historie").insert({
    akce_id: akceId,
    nabidka_id: akce.nabidka_id,
    user_id: internalUser?.id,
    typ: "email_odeslan",
    popis: `Briefing odeslán (${sent}/${recipients.length} příjemců) — akce "${akce.nazev}"`,
    metadata: { sent, total: recipients.length, errors },
  })

  if (errors.length > 0) {
    return { success: true, warning: `Odesláno ${sent}/${recipients.length}. Chyby: ${errors.join("; ")}` }
  }
  return { success: true, sent }
}

// ================================================================
// F-0015 — Zrušit akci (atomic via RPC fn_zrusit_akci)
// ================================================================

export async function zrusitAkci(
  akceId: string,
  duvod?: string
): Promise<{ success: true; affected_prirazeni: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  // Internal user id pro audit (RLS fallback viz resolveInternalUserId)
  const internalUserId = await resolveInternalUserId(user.id, user.email)
  if (!internalUserId) return { error: "Interní uživatel nenalezen — zkontrolujte propojení účtu (kód U2)" }

  // Načti nabidka_id pro revalidatePath
  const { data: akceBefore } = await supabase
    .from("akce").select("nabidka_id").eq("id", akceId).single()

  const { data, error } = await supabase.rpc("fn_zrusit_akci", {
    p_akce_id: akceId,
    p_duvod: duvod ?? null,
    p_user_id: internalUserId,
  })

  if (error) {
    const msg = error.message || ""
    if (msg.includes("HAS_COMPLETED_DOCHAZKA")) {
      return { error: "Akce má zaznamenanou kompletní docházku, nelze zrušit. Místo toho použijte 'Označit jako proběhlou'." }
    }
    if (msg.includes("AKCE_NOT_FOUND")) {
      return { error: "Akce nenalezena" }
    }
    return { error: error.message }
  }

  const result = (data ?? {}) as { success?: boolean; affected_prirazeni?: number }

  revalidatePath("/app/akce")
  revalidatePath(`/app/akce/${akceId}`)
  if (akceBefore?.nabidka_id) revalidatePath(`/app/nabidky/${akceBefore.nabidka_id}`)
  revalidatePath("/app/dashboard")

  return { success: true, affected_prirazeni: result.affected_prirazeni ?? 0 }
}

// ================================================================
// F-0015 — Inline stav change (ADR-1E)
// Guardy:
//  - * → zrusena: delegujeme na zrusitAkci (hard block kompletní docházka)
//  - probehla → planovana (reopen): insert historie typ='akce_reopen' (D-09 guard)
//  - planovana → probehla: warning pokud bez odchod (UI confirm)
// ================================================================

export async function updateAkceStav(
  akceId: string,
  noviStav: "planovana" | "probehla" | "zrusena",
  duvod?: string
): Promise<{ success: true; warning?: string } | { error: string }> {
  const parsedStav = stavEnum.safeParse(noviStav)
  if (!parsedStav.success) return { error: "Neplatný stav" }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const internalUserId = await resolveInternalUserId(user.id, user.email)
  if (!internalUserId) return { error: "Interní uživatel nenalezen — zkontrolujte propojení účtu (kód U2)" }

  const { data: current } = await supabase
    .from("akce").select("id, nazev, stav, nabidka_id").eq("id", akceId).single()
  if (!current) return { error: "Akce nenalezena" }

  // Delegace na zrusitAkci pro bulk prirazeni logic + guard
  if (parsedStav.data === "zrusena") {
    return (await zrusitAkci(akceId, duvod)) as { success: true } | { error: string }
  }

  // No-op
  if (current.stav === parsedStav.data) {
    return { success: true }
  }

  // zrusena → * blokováno (out of scope reopen zrušené, D-08)
  if (current.stav === "zrusena") {
    return { error: "Zrušenou akci nelze obnovit" }
  }

  let warning: string | undefined

  // planovana → probehla: zkontroluj, že existuje dochazka s odchod (INV pro warning)
  if (current.stav === "planovana" && parsedStav.data === "probehla") {
    const { count } = await supabase
      .from("dochazka")
      .select("id, prirazeni!inner(akce_id)", { count: "exact", head: true })
      .eq("prirazeni.akce_id", akceId)
      .not("odchod", "is", null)
    if (!count || count === 0) {
      warning = "Akce ještě neměla zaznamenanou docházku"
    }
  }

  // UPDATE akce
  const { error: updErr } = await supabase
    .from("akce")
    .update({ stav: parsedStav.data, updated_at: new Date().toISOString() })
    .eq("id", akceId)
  if (updErr) return { error: updErr.message }

  // Audit historie
  const isReopen = current.stav === "probehla" && parsedStav.data === "planovana"
  const typ = isReopen ? "akce_reopen" : "akce_stav_zmena"
  const popisBase = isReopen
    ? `Akce "${current.nazev}" obnovena (reopen)`
    : `Stav akce "${current.nazev}" změněn z ${current.stav} na ${parsedStav.data}`
  const popis = duvod ? `${popisBase}. Důvod: ${duvod}` : popisBase

  await supabase.from("historie").insert({
    akce_id: akceId,
    nabidka_id: current.nabidka_id,
    user_id: internalUserId,
    typ,
    popis,
    metadata: { old_stav: current.stav, new_stav: parsedStav.data, duvod: duvod ?? null },
  })

  revalidatePath("/app/akce")
  revalidatePath(`/app/akce/${akceId}`)
  if (current.nabidka_id) revalidatePath(`/app/nabidky/${current.nabidka_id}`)
  revalidatePath("/app/dashboard")

  return warning ? { success: true, warning } : { success: true }
}

// ================================================================
// F-0015 — updateAkce (D-05 allowlist pro proběhlé)
// ================================================================

export async function updateAkce(
  akceId: string,
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nepřihlášen" }

  const { data: internalUser } = await supabase
    .from("users").select("id").eq("auth_user_id", user.id).single()

  const { data: current } = await supabase
    .from("akce").select("id, nazev, stav, nabidka_id").eq("id", akceId).single()
  if (!current) return { error: "Akce nenalezena" }

  if (current.stav === "zrusena") {
    return { error: "Zrušenou akci nelze upravovat" }
  }

  const raw = Object.fromEntries(formData.entries())

  // D-05: proběhlé → jen allowlist poznamky + pocet_brigadniku/koordinatoru.
  // pocet_lidi je v DB GENERATED, do UPDATE nepatří. Pokud forms posílají
  // legacy pocet_lidi, ignorujeme — UI to přepíše PR B.
  let updatePayload: Record<string, unknown>
  if (current.stav === "probehla") {
    const parsed = probehlaAllowlist.safeParse({
      poznamky: raw.poznamky ?? undefined,
      pocet_brigadniku: raw.pocet_brigadniku || undefined,
      pocet_koordinatoru: raw.pocet_koordinatoru || undefined,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
    }
    updatePayload = {
      poznamky: parsed.data.poznamky ?? null,
      updated_at: new Date().toISOString(),
    }
    if (parsed.data.pocet_brigadniku !== undefined) {
      updatePayload.pocet_brigadniku = parsed.data.pocet_brigadniku
    }
    if (parsed.data.pocet_koordinatoru !== undefined) {
      updatePayload.pocet_koordinatoru = parsed.data.pocet_koordinatoru
    }
  } else {
    // planovana: plný update. Vyhoď legacy pocet_lidi (GENERATED v DB).
    const { pocet_lidi: _legacyPocetLidi, ...restRaw } = raw as Record<string, unknown>
    void _legacyPocetLidi
    const normalized = {
      ...restRaw,
      pocet_brigadniku: restRaw.pocet_brigadniku || undefined,
      pocet_koordinatoru: restRaw.pocet_koordinatoru || undefined,
    }
    const parsed = updateAkceFullSchema.safeParse(normalized)
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
    }
    updatePayload = {
      ...parsed.data,
      cas_od: parsed.data.cas_od || null,
      cas_do: parsed.data.cas_do || null,
      klient: parsed.data.klient || null,
      misto: parsed.data.misto || null,
      poznamky: parsed.data.poznamky ?? null,
      updated_at: new Date().toISOString(),
    }
  }

  const { error } = await supabase
    .from("akce")
    .update(updatePayload)
    .eq("id", akceId)

  if (error) return { error: error.message }

  // Audit
  await supabase.from("historie").insert({
    akce_id: akceId,
    nabidka_id: current.nabidka_id,
    user_id: internalUser?.id,
    typ: "akce_zmena",
    popis: `Upravena akce "${current.nazev}"`,
    metadata: { stav: current.stav, fields: Object.keys(updatePayload) },
  })

  revalidatePath("/app/akce")
  revalidatePath(`/app/akce/${akceId}`)
  if (current.nabidka_id) revalidatePath(`/app/nabidky/${current.nabidka_id}`)

  return { success: true }
}
