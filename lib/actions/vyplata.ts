"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUserRole } from "@/lib/actions/users"
import { z } from "zod"
import { revalidatePath } from "next/cache"

// ============================================================================
// F-0022 — Měsíční výplatní přehled (read-only load, PR 1)
// ============================================================================

export type VyplataCell = {
  prirazeniId: string
  dochazkaId: string | null
  prichod: string | null
  odchod: string | null
  hodinCelkem: number | null
  sazbaHodinova: number | null
  extraOdmenaKc: number | null
  celkemZaAkci: number
}

export type VyplataRow = {
  brigadnikId: string
  jmeno: string
  prijmeni: string
  typ: "dpp" | "osvc"
  cells: Record<string, VyplataCell> // key = akce_id
  rowTotal: number
}

export type VyplataAkce = {
  id: string
  nazev: string
  datum: string
}

export type VyplataMesicData = {
  mesic: string
  uzamceno: {
    at: string
    by: { jmeno: string | null; prijmeni: string | null } | null
  } | null
  akce: VyplataAkce[]
  dpp: VyplataRow[]
  osvc: VyplataRow[]
  totalDpp: number
  totalOsvc: number
}

type ViewRow = {
  mesic_rok: string
  prirazeni_id: string
  akce_id: string
  brigadnik_id: string
  prirazeni_status: string | null
  sazba_hodinova: number | null
  akce_nazev: string
  akce_datum: string
  akce_stav: string
  jmeno: string
  prijmeni: string
  typ_brigadnika: string
  dochazka_id: string | null
  prichod: string | null
  odchod: string | null
  hodin_celkem: number | null
  extra_odmena_kc: number | null
  celkem_za_akci: number | string | null
}

/**
 * Načte data pro měsíční výplatní přehled.
 * Scope: jen akce.stav = 'probehla' (Michal 28.4. — čistě pro účetnictví).
 * Auth: admin nebo náborář (dýško = peněžní = role-gate).
 */
export async function getVyplataMesic(mesic: string): Promise<
  { success: true; data: VyplataMesicData } | { error: string }
> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesic)) {
    return { error: "Neplatný formát měsíce (očekáváno YYYY-MM)" }
  }

  const role = await getCurrentUserRole()
  if (!role || !["admin", "naborar"].includes(role)) {
    return { error: "Nemáte oprávnění" }
  }

  const admin = createAdminClient()

  const { data: rows, error } = await admin
    .from("v_vyplata_mesic")
    .select("*")
    .eq("mesic_rok", mesic)
    .eq("akce_stav", "probehla")
    .neq("prirazeni_status", "vypadl")

  if (error) return { error: "Nepodařilo se načíst data" }

  const { data: lock } = await admin
    .from("vyplata_uzamceni")
    .select("uzamceno_at, uzamceno_by_user_id")
    .eq("mesic_rok", mesic)
    .maybeSingle()

  let lockInfo: VyplataMesicData["uzamceno"] = null
  if (lock) {
    const { data: lockUser } = await admin
      .from("users")
      .select("jmeno, prijmeni")
      .eq("id", lock.uzamceno_by_user_id)
      .maybeSingle()

    lockInfo = {
      at: lock.uzamceno_at as string,
      by: lockUser
        ? { jmeno: lockUser.jmeno ?? null, prijmeni: lockUser.prijmeni ?? null }
        : null,
    }
  }

  const viewRows = (rows ?? []) as ViewRow[]

  const akceMap = new Map<string, VyplataAkce>()
  const brigadniciMap = new Map<string, VyplataRow>()

  for (const r of viewRows) {
    if (!akceMap.has(r.akce_id)) {
      akceMap.set(r.akce_id, {
        id: r.akce_id,
        nazev: r.akce_nazev,
        datum: r.akce_datum,
      })
    }

    const typ: "dpp" | "osvc" = r.typ_brigadnika === "osvc" ? "osvc" : "dpp"
    let row = brigadniciMap.get(r.brigadnik_id)
    if (!row) {
      row = {
        brigadnikId: r.brigadnik_id,
        jmeno: r.jmeno,
        prijmeni: r.prijmeni,
        typ,
        cells: {},
        rowTotal: 0,
      }
      brigadniciMap.set(r.brigadnik_id, row)
    }

    const celkem = Number(r.celkem_za_akci ?? 0)
    row.cells[r.akce_id] = {
      prirazeniId: r.prirazeni_id,
      dochazkaId: r.dochazka_id,
      prichod: r.prichod,
      odchod: r.odchod,
      hodinCelkem: r.hodin_celkem !== null ? Number(r.hodin_celkem) : null,
      sazbaHodinova: r.sazba_hodinova !== null ? Number(r.sazba_hodinova) : null,
      extraOdmenaKc: r.extra_odmena_kc !== null ? Number(r.extra_odmena_kc) : null,
      celkemZaAkci: celkem,
    }
    row.rowTotal += celkem
  }

  const akce = [...akceMap.values()].sort((a, b) => a.datum.localeCompare(b.datum))
  const allRows = [...brigadniciMap.values()].sort((a, b) => {
    const byPrijmeni = a.prijmeni.localeCompare(b.prijmeni, "cs")
    if (byPrijmeni !== 0) return byPrijmeni
    return a.jmeno.localeCompare(b.jmeno, "cs")
  })

  const dpp = allRows.filter((r) => r.typ === "dpp")
  const osvc = allRows.filter((r) => r.typ === "osvc")
  const totalDpp = dpp.reduce((s, r) => s + r.rowTotal, 0)
  const totalOsvc = osvc.reduce((s, r) => s + r.rowTotal, 0)

  return {
    success: true,
    data: {
      mesic,
      uzamceno: lockInfo,
      akce,
      dpp,
      osvc,
      totalDpp,
      totalOsvc,
    },
  }
}

// ============================================================================
// PR 2 — inline editace sazby a dýška
// ============================================================================

const sazbaSchema = z
  .number()
  .nonnegative("Sazba nemůže být záporná")
  .max(99999.99, "Sazba je příliš vysoká")
  .nullable()

const dyskoSchema = z
  .number()
  .nonnegative("Dýško nemůže být záporné")
  .max(99999.99, "Dýško je příliš vysoké")
  .nullable()

/**
 * Authorize admin / náborář a ověř, že měsíc akce není uzamčený.
 * Vrátí { internalUserId, akceMesic, isLocked } nebo error.
 */
async function authorizeAndCheckLock(
  prirazeniId: string,
): Promise<
  | { ok: true; akceMesic: string; isLocked: boolean; internalUserId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Nepřihlášen" }

  const role = await getCurrentUserRole()
  if (!role || !["admin", "naborar"].includes(role)) {
    return { ok: false, error: "Nemáte oprávnění" }
  }

  const admin = createAdminClient()

  // Lookup interní users.id pro audit
  const { data: internalUser } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!internalUser) return { ok: false, error: "Uživatel nenalezen" }

  // Najdi akci a její měsíc
  const { data: prir } = await admin
    .from("prirazeni")
    .select("akce_id, akce:akce(datum)")
    .eq("id", prirazeniId)
    .maybeSingle()
  if (!prir) return { ok: false, error: "Přiřazení nenalezeno" }

  const akceData = (prir.akce as unknown) as { datum: string } | null
  if (!akceData?.datum) return { ok: false, error: "Akce bez data" }

  const akceMesic = akceData.datum.slice(0, 7) // YYYY-MM

  const { data: lock } = await admin
    .from("vyplata_uzamceni")
    .select("mesic_rok")
    .eq("mesic_rok", akceMesic)
    .maybeSingle()

  return {
    ok: true,
    akceMesic,
    isLocked: !!lock,
    internalUserId: internalUser.id as string,
  }
}

export type UpsertResult =
  | { success: true; serverValue: number | null }
  | { error: string; locked?: boolean }

/**
 * Update prirazeni.sazba_hodinova. Admin / náborář only. Lock blokuje
 * (PR 3 přidá override pro admina).
 */
export async function upsertSazbaHodinova(
  prirazeniId: string,
  sazba: number | null,
): Promise<UpsertResult> {
  const auth = await authorizeAndCheckLock(prirazeniId)
  if (!auth.ok) return { error: auth.error }
  if (auth.isLocked) {
    return { error: "Měsíc je uzamčený", locked: true }
  }

  const parsed = sazbaSchema.safeParse(sazba)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatná sazba" }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("prirazeni")
    .update({ sazba_hodinova: parsed.data })
    .eq("id", prirazeniId)
  if (error) return { error: "Nepodařilo se uložit" }

  revalidatePath(`/app/vyplaty/${auth.akceMesic}`)
  return { success: true, serverValue: parsed.data }
}

/**
 * Update dochazka.extra_odmena_kc. Pokud dochazka řádek neexistuje
 * (brigádník nemá ani příchod ani odchod), vytvoříme ho s NULL časy
 * a jen extra_odmena_kc.
 */
export async function upsertDyskoKc(
  prirazeniId: string,
  dysko: number | null,
): Promise<UpsertResult> {
  const auth = await authorizeAndCheckLock(prirazeniId)
  if (!auth.ok) return { error: auth.error }
  if (auth.isLocked) {
    return { error: "Měsíc je uzamčený", locked: true }
  }

  const parsed = dyskoSchema.safeParse(dysko)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatné dýško" }
  }

  const admin = createAdminClient()

  // Najdi prirazeni → akce_id, brigadnik_id (potřebné pro insert)
  const { data: prir } = await admin
    .from("prirazeni")
    .select("akce_id, brigadnik_id")
    .eq("id", prirazeniId)
    .maybeSingle()
  if (!prir) return { error: "Přiřazení nenalezeno" }

  const { data: existing } = await admin
    .from("dochazka")
    .select("id")
    .eq("prirazeni_id", prirazeniId)
    .maybeSingle()

  if (existing) {
    const { error } = await admin
      .from("dochazka")
      .update({ extra_odmena_kc: parsed.data })
      .eq("id", existing.id)
    if (error) return { error: "Nepodařilo se uložit" }
  } else {
    const { error } = await admin.from("dochazka").insert({
      prirazeni_id: prirazeniId,
      akce_id: prir.akce_id as string,
      brigadnik_id: prir.brigadnik_id as string,
      prichod: null,
      odchod: null,
      hodnoceni: null,
      poznamka: null,
      extra_odmena_kc: parsed.data,
    })
    if (error) return { error: "Nepodařilo se uložit" }
  }

  revalidatePath(`/app/vyplaty/${auth.akceMesic}`)
  return { success: true, serverValue: parsed.data }
}
