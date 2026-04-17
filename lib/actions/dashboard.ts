"use server"

import { createClient } from "@/lib/supabase/server"

export async function getDashboardData() {
  const supabase = await createClient()

  // Nabidky s obsazeností (aktivní = ne-ukončené)
  const { data: nabidky } = await supabase
    .from("nabidky")
    .select("id, nazev, pocet_lidi, typ, publikovano, pipeline_entries(count)")
    .neq("typ", "ukoncena")
    .order("created_at", { ascending: false })

  // Blížící se akce (příštích 30 dní)
  const today = new Date().toISOString().slice(0, 10)
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const { data: akce } = await supabase
    .from("akce")
    .select("id, nazev, datum, cas_od, misto, pocet_lidi, stav, prirazeni(count)")
    .gte("datum", today)
    .lte("datum", future)
    .in("stav", ["planovana", "probehla"])
    .order("datum", { ascending: true })
    .limit(10)

  // Noví zájemci (posledních 7 dní)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: noviZajemci } = await supabase
    .from("pipeline_entries")
    .select("id")
    .eq("stav", "zajemce")
    .gte("created_at", weekAgo)

  // Celkem brigádníků
  const { count: brigadniciCount } = await supabase
    .from("brigadnici")
    .select("id", { count: "exact", head: true })
    .eq("aktivni", true)

  // Chybějící DPP — brigádníci přiřazení na blížící se akce bez podepsané DPP
  const { data: chybejiciDpp } = await supabase
    .from("v_chybejici_dpp")
    .select("id, jmeno, prijmeni, telefon, akce_nazev, akce_datum, dpp_stav")
    .gte("akce_datum", today)
    .limit(10)

  return {
    nabidky: nabidky ?? [],
    akce: akce ?? [],
    noviZajemciCount: noviZajemci?.length ?? 0,
    brigadniciCount: brigadniciCount ?? 0,
    chybejiciDpp: chybejiciDpp ?? [],
  }
}
