"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserRole } from "@/lib/actions/users"

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
