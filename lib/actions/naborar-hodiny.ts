"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { z } from "zod"
import { parseMinutes } from "@/lib/utils/minutes"

// ================================================================
// F-0019 — Hodiny-nábor per-zakázka + v minutách
// ================================================================
// Data model (po migraci 20260426000000_f0019_hodiny_nabor.sql):
//   - trvani_minut INT  (0, 1440]  — nahrazuje hodin
//   - nabidka_id uuid NULL FK ON DELETE SET NULL
//   - typ_zaznamu ('nabidka'|'ostatni')  — default 'ostatni'
//   - users.sazba_kc_hod numeric(6,2) NULL
//   - v_hodiny_per_zakazka VIEW (admin-only aggregate)
//
// RLS strategie (D-F0019-09):
//   - SELECT na users/sazba volný, ale actions whitelistují sloupce;
//     non-admin caller nedostane sazba_kc_hod cizích osob do response.
//   - UPDATE sazby pouze přes updateUserSazba (users.ts) s admin guardem.

// ================================================================
// Types
// ================================================================

export type TypZaznamu = "nabidka" | "ostatni"
export type MistoPrace = "kancelar" | "remote" | "akce"

export interface HodinyRow {
  id: string
  user_id: string
  datum: string
  trvani_minut: number
  misto_prace: MistoPrace | null
  napln_prace: string
  typ_zaznamu: TypZaznamu
  nabidka_id: string | null
  je_zpetny_zapis: boolean
  duvod_zpozdeni: string | null
  created_at: string
  updated_at?: string | null
}

export interface HodinyRowWithMeta extends HodinyRow {
  naborar?: {
    jmeno: string
    prijmeni: string
    email: string
    sazba_kc_hod?: number | null // jen pro admin response
  } | null
  nabidka?: { id: string; nazev: string } | null
}

export interface HodinyBreakdownByNabidka {
  nabidka_id: string | null
  nazev: string
  minut: number
  hodin: number
}

export interface MojeHodinyThisMonth {
  total_minut: number
  total_hodin: number
  breakdown: HodinyBreakdownByNabidka[]
}

export interface PrehledZakazkaNabrarBreakdown {
  user_id: string
  jmeno: string
  prijmeni: string
  minut: number
  hodin: number
  sazba_kc_hod: number | null
  naklad_kc: number
}

export interface PrehledZakazkaRow {
  nabidka_id: string
  zakazka_nazev: string
  mesic: string // 'YYYY-MM-01' first day
  celkem_minut: number
  celkem_hodin: number
  naklad_kc: number
  pocet_naborarek: number
  breakdown_per_naborar: PrehledZakazkaNabrarBreakdown[]
}

export interface AktivniNabidkaPickerItem {
  id: string
  nazev: string
}

// ================================================================
// Helpers
// ================================================================

/** Vrací first-of-month a first-of-next-month pro mesic="YYYY-MM". */
function monthRange(mesic: string): { start: string; end: string } {
  const [yStr, mStr] = mesic.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Neplatný formát měsíce: ${mesic}`)
  }
  const start = `${y}-${String(m).padStart(2, "0")}-01`
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`
  return { start, end }
}

/**
 * Resolve internal users.id + role z auth user.
 * Admin client fallback (F-0013 HF4c pattern) — RLS SELECT na users
 * může vrátit prázdno pro náborářku, takže po auth check jdeme přes admin.
 */
async function getInternalUser(): Promise<
  | { id: string; role: "admin" | "naborar"; authUserId: string }
  | null
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
  return {
    id: (data as { id: string }).id,
    role: role as "admin" | "naborar",
    authUserId: user.id,
  }
}

// ================================================================
// Read-only queries
// ================================================================

/**
 * Vlastní záznamy (self). RLS by měla filtrovat automaticky,
 * ale explicit `user_id = internalUser.id` je defense-in-depth.
 */
export async function getMyHodiny(params: {
  mesic?: string
} = {}): Promise<HodinyRowWithMeta[]> {
  const me = await getInternalUser()
  if (!me) return []

  const admin = createAdminClient()
  let query = admin
    .from("naborar_hodiny")
    .select(
      "id, user_id, datum, trvani_minut, misto_prace, napln_prace, typ_zaznamu, nabidka_id, je_zpetny_zapis, duvod_zpozdeni, created_at, updated_at, nabidka:nabidky(id, nazev)",
    )
    .eq("user_id", me.id)
    .order("datum", { ascending: false })
    .order("created_at", { ascending: false })

  if (params.mesic) {
    const { start, end } = monthRange(params.mesic)
    query = query.gte("datum", start).lt("datum", end)
  }

  const { data } = await query
  return (data ?? []) as unknown as HodinyRowWithMeta[]
}

/**
 * Admin-only view — všichni náborářů záznamy, optional filter userId.
 * Non-admin caller → []. Sazba se zahrnuje jen pro admin.
 */
export async function getAllHodiny(params: {
  mesic?: string
  userId?: string
} = {}): Promise<HodinyRowWithMeta[]> {
  const me = await getInternalUser()
  if (!me || me.role !== "admin") return []

  const admin = createAdminClient()
  let query = admin
    .from("naborar_hodiny")
    .select(
      "id, user_id, datum, trvani_minut, misto_prace, napln_prace, typ_zaznamu, nabidka_id, je_zpetny_zapis, duvod_zpozdeni, created_at, updated_at, naborar:users!naborar_hodiny_user_id_fkey(jmeno, prijmeni, email, sazba_kc_hod), nabidka:nabidky(id, nazev)",
    )
    .order("datum", { ascending: false })
    .order("created_at", { ascending: false })

  if (params.mesic) {
    const { start, end } = monthRange(params.mesic)
    query = query.gte("datum", start).lt("datum", end)
  }
  if (params.userId) {
    query = query.eq("user_id", params.userId)
  }

  const { data } = await query
  return (data ?? []) as unknown as HodinyRowWithMeta[]
}

/**
 * Dashboard card (F-0017 replace placeholder). Aktuální kalendářní měsíc,
 * self-only. Breakdown per nabídka včetně 'ostatni' (nabidka_id=NULL → "Ostatní").
 */
export async function getMyHodinyThisMonth(): Promise<MojeHodinyThisMonth> {
  const me = await getInternalUser()
  if (!me) return { total_minut: 0, total_hodin: 0, breakdown: [] }

  const now = new Date()
  const mesic = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const { start, end } = monthRange(mesic)

  const admin = createAdminClient()
  const { data } = await admin
    .from("naborar_hodiny")
    .select(
      "trvani_minut, nabidka_id, typ_zaznamu, nabidka:nabidky(id, nazev)",
    )
    .eq("user_id", me.id)
    .gte("datum", start)
    .lt("datum", end)

  if (!data || data.length === 0) {
    return { total_minut: 0, total_hodin: 0, breakdown: [] }
  }

  let total = 0
  const byNabidka = new Map<string, { nazev: string; minut: number }>()

  for (const row of data) {
    const minut = Number((row as { trvani_minut: number }).trvani_minut) || 0
    total += minut

    const nabidkaId = (row as unknown as { nabidka_id: string | null }).nabidka_id
    const nabidkaRaw = (row as unknown as {
      nabidka: { id: string; nazev: string } | { id: string; nazev: string }[] | null
    }).nabidka
    const nabidka = Array.isArray(nabidkaRaw) ? (nabidkaRaw[0] ?? null) : nabidkaRaw
    const typ = (row as unknown as { typ_zaznamu: string }).typ_zaznamu

    // Bucket key: nabidka_id pokud existuje, jinak 'ostatni' (společná bucket pro ostatni+orphaned nabidka)
    const key = nabidkaId ?? "__ostatni__"
    const nazev =
      nabidka?.nazev ??
      (typ === "nabidka" ? "Smazaná zakázka" : "Ostatní")

    const prev = byNabidka.get(key)
    if (prev) {
      prev.minut += minut
    } else {
      byNabidka.set(key, { nazev, minut })
    }
  }

  const breakdown: HodinyBreakdownByNabidka[] = [...byNabidka.entries()]
    .map(([key, v]) => ({
      nabidka_id: key === "__ostatni__" ? null : key,
      nazev: v.nazev,
      minut: v.minut,
      hodin: Math.round((v.minut / 60) * 100) / 100,
    }))
    .sort((a, b) => b.minut - a.minut)

  return {
    total_minut: total,
    total_hodin: Math.round((total / 60) * 100) / 100,
    breakdown,
  }
}

/**
 * Admin-only agregace per zakázka přes VIEW `v_hodiny_per_zakazka`.
 * Doplní per-náborářka breakdown (view ne-includes). Filter mesic optional.
 */
export async function getHodinyPrehledZakazky(params: {
  mesic?: string
} = {}): Promise<PrehledZakazkaRow[]> {
  const me = await getInternalUser()
  if (!me || me.role !== "admin") return []

  const admin = createAdminClient()

  let viewQuery = admin.from("v_hodiny_per_zakazka").select("*")
  if (params.mesic) {
    const { start, end } = monthRange(params.mesic)
    viewQuery = viewQuery.gte("mesic", start).lt("mesic", end)
  }
  const { data: viewRows } = await viewQuery
  if (!viewRows || viewRows.length === 0) return []

  type ViewRow = {
    nabidka_id: string
    zakazka_nazev: string
    mesic: string
    celkem_minut: number
    celkem_hodin: number
    pocet_naborarek: number
    naklad_kc: number
  }

  const rows = viewRows as unknown as ViewRow[]
  const nabidkaIds = Array.from(new Set(rows.map((r) => r.nabidka_id)))

  // Raw zdrojová data pro per-náborářka breakdown.
  let detailQuery = admin
    .from("naborar_hodiny")
    .select(
      "user_id, nabidka_id, trvani_minut, datum, naborar:users!naborar_hodiny_user_id_fkey(jmeno, prijmeni, sazba_kc_hod)",
    )
    .eq("typ_zaznamu", "nabidka")
    .in("nabidka_id", nabidkaIds)

  if (params.mesic) {
    const { start, end } = monthRange(params.mesic)
    detailQuery = detailQuery.gte("datum", start).lt("datum", end)
  }

  const { data: detailRows } = await detailQuery

  type DetailRow = {
    user_id: string
    nabidka_id: string
    trvani_minut: number
    datum: string
    naborar:
      | {
          jmeno: string
          prijmeni: string
          sazba_kc_hod: number | null
        }
      | Array<{
          jmeno: string
          prijmeni: string
          sazba_kc_hod: number | null
        }>
      | null
  }

  const detailsByNabidka = new Map<
    string,
    Map<string, PrehledZakazkaNabrarBreakdown>
  >()

  for (const r of (detailRows ?? []) as unknown as DetailRow[]) {
    const nabidkaId = r.nabidka_id
    if (!nabidkaId) continue
    const naborar = Array.isArray(r.naborar) ? (r.naborar[0] ?? null) : r.naborar
    if (!naborar) continue

    let perNab = detailsByNabidka.get(nabidkaId)
    if (!perNab) {
      perNab = new Map()
      detailsByNabidka.set(nabidkaId, perNab)
    }

    const existing = perNab.get(r.user_id)
    const minut = Number(r.trvani_minut) || 0
    if (existing) {
      existing.minut += minut
      existing.hodin = Math.round((existing.minut / 60) * 100) / 100
      existing.naklad_kc = Math.round(
        (existing.minut / 60) * (existing.sazba_kc_hod ?? 0) * 100,
      ) / 100
    } else {
      perNab.set(r.user_id, {
        user_id: r.user_id,
        jmeno: naborar.jmeno,
        prijmeni: naborar.prijmeni,
        minut,
        hodin: Math.round((minut / 60) * 100) / 100,
        sazba_kc_hod: naborar.sazba_kc_hod,
        naklad_kc:
          Math.round((minut / 60) * (naborar.sazba_kc_hod ?? 0) * 100) / 100,
      })
    }
  }

  return rows.map((r) => ({
    nabidka_id: r.nabidka_id,
    zakazka_nazev: r.zakazka_nazev,
    mesic: r.mesic,
    celkem_minut: Number(r.celkem_minut) || 0,
    celkem_hodin: Number(r.celkem_hodin) || 0,
    naklad_kc: Number(r.naklad_kc) || 0,
    pocet_naborarek: Number(r.pocet_naborarek) || 0,
    breakdown_per_naborar: [
      ...(detailsByNabidka.get(r.nabidka_id)?.values() ?? []),
    ].sort((a, b) => b.minut - a.minut),
  }))
}

/**
 * Picker source — aktivní nabídky (ne 'ukoncena'), pro combobox v dialogu.
 * Auth only (nábor vidí stejný set jako admin — per architect §2 není leak).
 */
export async function getActiveNabidkyForPicker(): Promise<
  AktivniNabidkaPickerItem[]
> {
  const me = await getInternalUser()
  if (!me) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from("nabidky")
    .select("id, nazev, typ")
    .neq("typ", "ukoncena")
    .order("nazev", { ascending: true })

  return (data ?? []).map((n) => ({
    id: (n as { id: string }).id,
    nazev: (n as { nazev: string }).nazev,
  }))
}

// ================================================================
// Mutations
// ================================================================

const addHodinyBaseSchema = z.object({
  datum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatný formát data (YYYY-MM-DD)"),
  trvani_minut: z
    .number()
    .int("Trvání musí být celé číslo minut")
    .positive("Trvání musí být kladné")
    .max(1440, "Trvání nesmí přesáhnout 24 hodin"),
  misto_prace: z.enum(["kancelar", "remote", "akce"]).nullable().optional(),
  napln_prace: z.string().min(1, "Náplň práce je povinná").max(2000),
  typ_zaznamu: z.enum(["nabidka", "ostatni"]),
  nabidka_id: z.string().uuid().nullable().optional(),
  je_zpetny_zapis: z.boolean().optional(),
  duvod_zpozdeni: z.string().max(500).nullable().optional(),
})

const addHodinySchema = addHodinyBaseSchema.superRefine((val, ctx) => {
  if (val.typ_zaznamu === "nabidka" && !val.nabidka_id) {
    ctx.addIssue({
      code: "custom",
      message: "Pro typ 'nabidka' musí být vybrána zakázka",
      path: ["nabidka_id"],
    })
  }
  if (val.typ_zaznamu === "ostatni" && val.nabidka_id) {
    ctx.addIssue({
      code: "custom",
      message: "Pro typ 'ostatni' nesmí být vyplněna zakázka",
      path: ["nabidka_id"],
    })
  }
})

export type AddHodinyInput = z.input<typeof addHodinySchema>

/**
 * Přidat záznam do naborar_hodiny. Vkládá se pod self (user_id = internalUser.id).
 * App-layer invariant: typ_zaznamu ↔ nabidka_id (Zod superRefine).
 * Retroaktivní zápis (> 1 den zpětně) vyžaduje duvod_zpozdeni.
 */
export async function addHodiny(
  input: AddHodinyInput,
): Promise<{ success: true; id: string } | { error: string }> {
  const me = await getInternalUser()
  if (!me) return { error: "Nepřihlášen" }

  const parsed = addHodinySchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const data = parsed.data

  // Auto-detect zpětného zápisu (> 1 den rozdílu od today)
  const entryDate = new Date(data.datum)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  entryDate.setHours(0, 0, 0, 0)
  const diffDays = Math.floor(
    (now.getTime() - entryDate.getTime()) / 86400000,
  )
  // QA fix: sjednocení s FE threshold (7 dní). Zápis 2-7 dní zpětně je OK bez důvodu
  // (běžná pracovní realita). Starší = vyžaduje vysvětlení pro audit.
  const isLate = diffDays > 7
  if (isLate && !data.duvod_zpozdeni) {
    return { error: "Zpětný zápis (>7 dní) vyžaduje uvedení důvodu zpoždění" }
  }

  const admin = createAdminClient()
  const { data: inserted, error } = await admin
    .from("naborar_hodiny")
    .insert({
      user_id: me.id,
      datum: data.datum,
      trvani_minut: data.trvani_minut,
      misto_prace: data.misto_prace ?? null,
      napln_prace: data.napln_prace,
      typ_zaznamu: data.typ_zaznamu,
      nabidka_id: data.typ_zaznamu === "nabidka" ? data.nabidka_id! : null,
      je_zpetny_zapis: isLate,
      duvod_zpozdeni: isLate ? (data.duvod_zpozdeni ?? null) : null,
    })
    .select("id")
    .single()

  if (error || !inserted) {
    return { error: error?.message ?? "Nepodařilo se uložit" }
  }

  await admin.from("historie").insert({
    user_id: me.id,
    nabidka_id: data.typ_zaznamu === "nabidka" ? data.nabidka_id! : null,
    typ: "hodiny_pridano",
    popis: `Zapsáno ${data.trvani_minut} min (${data.datum}, ${data.typ_zaznamu})`,
    metadata: {
      hodiny_id: (inserted as { id: string }).id,
      trvani_minut: data.trvani_minut,
      typ_zaznamu: data.typ_zaznamu,
      nabidka_id: data.nabidka_id ?? null,
      je_zpetny_zapis: isLate,
    },
  })

  revalidatePath("/app/hodiny")
  revalidatePath("/app/hodiny/prehled")
  revalidatePath("/app/dashboard")

  return { success: true, id: (inserted as { id: string }).id }
}

const updateHodinySchema = addHodinyBaseSchema.partial().superRefine(
  (val, ctx) => {
    // Partial validation: když přijde typ_zaznamu, musí být párováno s nabidka_id
    // (invariant se doplní při merge s existujícím row v updateHodiny actionu).
    if (val.typ_zaznamu === "nabidka" && val.nabidka_id === null) {
      ctx.addIssue({
        code: "custom",
        message: "Pro typ 'nabidka' musí být vybrána zakázka",
        path: ["nabidka_id"],
      })
    }
    if (val.typ_zaznamu === "ostatni" && val.nabidka_id) {
      ctx.addIssue({
        code: "custom",
        message: "Pro typ 'ostatni' nesmí být vyplněna zakázka",
        path: ["nabidka_id"],
      })
    }
  },
)

export type UpdateHodinyInput = z.input<typeof updateHodinySchema>

/**
 * Update hodin. Own (self) OR admin. Pokud admin edituje cizí záznam,
 * logujeme audit `hodiny_admin_correction` s before/after diffem.
 */
export async function updateHodiny(
  id: string,
  patch: UpdateHodinyInput,
): Promise<{ success: true } | { error: string }> {
  const me = await getInternalUser()
  if (!me) return { error: "Nepřihlášen" }
  if (!id) return { error: "Chybí ID záznamu" }

  const parsed = updateHodinySchema.safeParse(patch)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná data" }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from("naborar_hodiny")
    .select(
      "id, user_id, datum, trvani_minut, misto_prace, napln_prace, typ_zaznamu, nabidka_id, je_zpetny_zapis, duvod_zpozdeni",
    )
    .eq("id", id)
    .single()

  if (!existing) return { error: "Záznam nenalezen" }

  const row = existing as HodinyRow
  const isOwner = row.user_id === me.id
  const isAdmin = me.role === "admin"
  if (!isOwner && !isAdmin) {
    return { error: "Nemáte oprávnění upravit tento záznam" }
  }

  // Merge patch + re-check invariant na finálním stavu
  const merged: HodinyRow = { ...row, ...parsed.data } as HodinyRow
  if (merged.typ_zaznamu === "nabidka" && !merged.nabidka_id) {
    return { error: "Pro typ 'nabidka' musí být vybrána zakázka" }
  }
  if (merged.typ_zaznamu === "ostatni" && merged.nabidka_id) {
    return { error: "Pro typ 'ostatni' nesmí být vyplněna zakázka" }
  }

  const updatePayload: Record<string, unknown> = { ...parsed.data }
  // Normalizace: pokud je nový typ ostatni, shodíme nabidka_id
  if (merged.typ_zaznamu === "ostatni") {
    updatePayload.nabidka_id = null
  }

  const { error } = await admin
    .from("naborar_hodiny")
    .update(updatePayload)
    .eq("id", id)

  if (error) return { error: error.message }

  // Audit
  const isAdminCorrection = isAdmin && !isOwner
  const typ = isAdminCorrection ? "hodiny_admin_correction" : "hodiny_upraveno"
  const diff: Record<string, { before: unknown; after: unknown }> = {}
  for (const key of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
    const after = (parsed.data as Record<string, unknown>)[key as string]
    const before = (row as unknown as Record<string, unknown>)[key as string]
    if (before !== after) {
      diff[key as string] = { before, after }
    }
  }

  await admin.from("historie").insert({
    user_id: row.user_id, // afected user (owner of the record)
    nabidka_id: merged.nabidka_id ?? null,
    typ,
    popis: isAdminCorrection
      ? `Admin opravil cizí záznam hodin (${row.datum})`
      : `Záznam hodin upraven (${row.datum})`,
    metadata: {
      hodiny_id: id,
      actor_user_id: me.id,
      diff,
    },
  })

  revalidatePath("/app/hodiny")
  revalidatePath("/app/hodiny/prehled")
  revalidatePath("/app/dashboard")
  return { success: true }
}

/**
 * Smazání záznamu. Own OR admin. Audit `hodiny_smazano`.
 */
export async function deleteHodiny(
  id: string,
): Promise<{ success: true } | { error: string }> {
  const me = await getInternalUser()
  if (!me) return { error: "Nepřihlášen" }
  if (!id) return { error: "Chybí ID záznamu" }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from("naborar_hodiny")
    .select("id, user_id, datum, trvani_minut, nabidka_id, typ_zaznamu")
    .eq("id", id)
    .single()

  if (!existing) return { error: "Záznam nenalezen" }
  const row = existing as {
    id: string
    user_id: string
    datum: string
    trvani_minut: number
    nabidka_id: string | null
    typ_zaznamu: TypZaznamu
  }

  const isOwner = row.user_id === me.id
  const isAdmin = me.role === "admin"
  if (!isOwner && !isAdmin) {
    return { error: "Nemáte oprávnění smazat tento záznam" }
  }

  const { error } = await admin.from("naborar_hodiny").delete().eq("id", id)
  if (error) return { error: error.message }

  await admin.from("historie").insert({
    user_id: row.user_id,
    nabidka_id: row.nabidka_id,
    typ: "hodiny_smazano",
    popis: `Smazán záznam hodin (${row.datum}, ${row.trvani_minut} min)`,
    metadata: {
      hodiny_id: id,
      actor_user_id: me.id,
      admin_deletion: isAdmin && !isOwner,
      snapshot: row,
    },
  })

  revalidatePath("/app/hodiny")
  revalidatePath("/app/hodiny/prehled")
  revalidatePath("/app/dashboard")
  return { success: true }
}

// ================================================================
// Legacy shims (deprecated, pro back-compat s F-0017 a starou UI).
// Frontend F-0019 přepíše konzumenty → pak lze smazat v cleanup sprintu.
// ================================================================

/**
 * @deprecated Použij `addHodiny({...})`. Tento shim přijímá FormData
 * se starým tvarem (hodin v desetinách) a převede na minuty. Zachováno
 * aby `components/hodiny/zapsat-hodiny-dialog.tsx` nekrachlo do FE rewrite.
 */
export async function zapsatHodiny(
  formData: FormData,
): Promise<{ success: true } | { error: string }> {
  const raw = Object.fromEntries(formData.entries())

  const hodinRaw = String((raw as Record<string, unknown>).hodin ?? "")
  // Podporuj jak staré `hodin` (desetinné), tak nové `trvani_minut`.
  let trvani_minut: number | null = null
  if ((raw as Record<string, unknown>).trvani_minut) {
    const parsed = parseMinutes(
      String((raw as Record<string, unknown>).trvani_minut),
    )
    trvani_minut = parsed
  } else if (hodinRaw) {
    const asFloat = Number(hodinRaw.replace(",", "."))
    if (Number.isFinite(asFloat) && asFloat > 0) {
      trvani_minut = Math.max(1, Math.min(1440, Math.round(asFloat * 60)))
    }
  }
  if (trvani_minut === null) {
    return { error: "Neplatný formát trvání" }
  }

  return addHodiny({
    datum: String((raw as Record<string, unknown>).datum ?? ""),
    trvani_minut,
    misto_prace: (raw as Record<string, string>).misto_prace as
      | MistoPrace
      | undefined,
    napln_prace: String((raw as Record<string, unknown>).napln_prace ?? ""),
    typ_zaznamu: "ostatni",
    nabidka_id: null,
    duvod_zpozdeni:
      (raw as Record<string, string>).duvod_zpozdeni ?? undefined,
  })
}

/**
 * @deprecated Použij `getHodinyPrehledZakazky` nebo `getAllHodiny`.
 * Zachován pro back-compat se starou `/app/hodiny/page.tsx` admin souhrnem.
 */
export async function getHodinySouhrn(
  mesic: string,
): Promise<
  Array<{ jmeno: string; prijmeni: string; celkem: number; dnu: number }>
> {
  const me = await getInternalUser()
  if (!me || me.role !== "admin") return []

  const { start, end } = monthRange(mesic)
  const admin = createAdminClient()
  const { data } = await admin
    .from("naborar_hodiny")
    .select(
      "user_id, trvani_minut, datum, naborar:users!naborar_hodiny_user_id_fkey(jmeno, prijmeni)",
    )
    .gte("datum", start)
    .lt("datum", end)

  if (!data) return []

  const map = new Map<
    string,
    { jmeno: string; prijmeni: string; celkem: number; dnu: Set<string> }
  >()
  for (const row of data) {
    const r = row as unknown as {
      user_id: string
      trvani_minut: number
      datum: string
      naborar:
        | { jmeno: string; prijmeni: string }
        | Array<{ jmeno: string; prijmeni: string }>
        | null
    }
    const naborar = Array.isArray(r.naborar) ? (r.naborar[0] ?? null) : r.naborar
    if (!naborar) continue
    const existing = map.get(r.user_id)
    const hodinDecimal = Number(r.trvani_minut) / 60
    if (existing) {
      existing.celkem += hodinDecimal
      existing.dnu.add(r.datum)
    } else {
      map.set(r.user_id, {
        jmeno: naborar.jmeno,
        prijmeni: naborar.prijmeni,
        celkem: hodinDecimal,
        dnu: new Set([r.datum]),
      })
    }
  }

  return [...map.values()].map((v) => ({
    jmeno: v.jmeno,
    prijmeni: v.prijmeni,
    celkem: Math.round(v.celkem * 100) / 100,
    dnu: v.dnu.size,
  }))
}

/**
 * @deprecated Přesun do samostatného dashboardu / metrik feature.
 * Zachováno aby stará `/app/hodiny/page.tsx` nekrachla.
 */
export async function getRecruitmentMetrics(mesic: string): Promise<{
  totalHours: number
  hiredCount: number
  eventCount: number
  costPerHired: number | null
  costPerEvent: number | null
  totalCost: number
}> {
  const me = await getInternalUser()
  if (!me || me.role !== "admin") {
    return {
      totalHours: 0,
      hiredCount: 0,
      eventCount: 0,
      costPerHired: null,
      costPerEvent: null,
      totalCost: 0,
    }
  }

  const { start, end } = monthRange(mesic)
  const admin = createAdminClient()

  const { data: hodinyData } = await admin
    .from("naborar_hodiny")
    .select("trvani_minut")
    .gte("datum", start)
    .lt("datum", end)

  const totalMinut = (hodinyData ?? []).reduce(
    (sum, h) => sum + Number((h as { trvani_minut: number }).trvani_minut || 0),
    0,
  )
  const totalHours = Math.round((totalMinut / 60) * 100) / 100

  const { data: hiredData } = await admin
    .from("pipeline_entries")
    .select("id")
    .eq("stav", "prijaty_vse_vyreseno")
    .gte("updated_at", start)
    .lt("updated_at", end)

  const hiredCount = hiredData?.length ?? 0

  const { data: akceData } = await admin
    .from("akce")
    .select("id")
    .gte("datum", start)
    .lt("datum", end)

  const eventCount = akceData?.length ?? 0

  const hourlyRate = 250 // Kč/hod (legacy default; F-0019 user-level sazby nahradí)
  const totalCost = Math.round(totalHours * hourlyRate)
  return {
    totalHours,
    hiredCount,
    eventCount,
    costPerHired: hiredCount > 0 ? Math.round(totalCost / hiredCount) : null,
    costPerEvent: eventCount > 0 ? Math.round(totalCost / eventCount) : null,
    totalCost,
  }
}
