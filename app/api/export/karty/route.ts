import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decrypt } from "@/lib/utils/crypto"
import ExcelJS from "exceljs"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const mesic = request.nextUrl.searchParams.get("mesic")
  if (!mesic) return NextResponse.json({ error: "Missing mesic" }, { status: 400 })

  const start = `${mesic}-01`
  const [y, m] = mesic.split("-").map(Number)
  const nextM = (m ?? 0) === 12 ? 1 : (m ?? 0) + 1; const nextY = (m ?? 0) === 12 ? (y ?? 0) + 1 : (y ?? 0); const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`

  // Get unique brigadnici who worked this month
  const { data: dochazka } = await supabase
    .from("dochazka")
    .select("brigadnik_id, akce:akce!inner(datum)")
    .gte("akce.datum", start)
    .lt("akce.datum", end)

  const brigadnikIds = [...new Set((dochazka ?? []).map((d) => d.brigadnik_id))]

  if (brigadnikIds.length === 0) {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet("Karty zaměstnanců")
    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=karty_${mesic}.xlsx`,
      },
    })
  }

  const { data: brigadnici } = await supabase
    .from("brigadnici")
    .select("id, jmeno, prijmeni, rodne_cislo, datum_narozeni, adresa, cislo_op, zdravotni_pojistovna, cislo_uctu, kod_banky, vzdelani, typ_brigadnika, narodnost, chce_ruzove_prohlaseni, osvc_ico, osvc_dic, osvc_fakturacni_adresa")
    .in("id", brigadnikIds)
    .order("prijmeni", { ascending: true })

  // F-0016 1H: footer date-of-change — nejnovější historie řádek typu "brigadnik_typ_zmena"
  // (source of truth: lib/actions/brigadnici.ts:429-435 píše { typ, metadata: { before, after } })
  const { data: typHistorie } = await supabase
    .from("historie")
    .select("brigadnik_id, created_at, metadata")
    .eq("typ", "brigadnik_typ_zmena")
    .in("brigadnik_id", brigadnikIds)
    .order("created_at", { ascending: false })
  const lastTypChange = new Map<string, { at: string; from: string | null; to: string | null }>()
  for (const h of typHistorie ?? []) {
    if (!h.brigadnik_id || lastTypChange.has(h.brigadnik_id)) continue
    const meta = h.metadata as { before?: string | null; after?: string | null } | null
    if (!meta) continue
    lastTypChange.set(h.brigadnik_id, {
      at: h.created_at,
      from: meta.before ?? null,
      to: meta.after ?? null,
    })
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Karty zaměstnanců")
  ws.columns = [
    { header: "Jméno", key: "jmeno", width: 15 },
    { header: "Příjmení", key: "prijmeni", width: 15 },
    { header: "Typ", key: "typ", width: 18 },
    { header: "Národnost", key: "narodnost", width: 12 },
    { header: "Rodné číslo", key: "rodne_cislo", width: 15 },
    { header: "Datum narození", key: "datum_narozeni", width: 14 },
    { header: "Trvalé bydliště", key: "adresa", width: 30 },
    { header: "Číslo OP", key: "cislo_op", width: 12 },
    { header: "ZP", key: "zp", width: 10 },
    { header: "Číslo účtu", key: "ucet", width: 20 },
    { header: "Vzdělání", key: "vzdelani", width: 15 },
    { header: "Růžové prohlášení", key: "ruzove", width: 18 },
    { header: "IČO (OSVČ)", key: "osvc_ico", width: 12 },
    { header: "DIČ (OSVČ)", key: "osvc_dic", width: 14 },
    { header: "Fakturační adresa (OSVČ)", key: "osvc_adresa", width: 30 },
    { header: "Poznámka k typu", key: "typ_poznamka", width: 36 },
  ]

  for (const b of brigadnici ?? []) {
    let rc = b.rodne_cislo ?? ""
    let op = b.cislo_op ?? ""
    let dic = b.osvc_dic ?? ""
    try { if (rc && rc.includes(":")) rc = decrypt(rc) } catch { /* not encrypted */ }
    try { if (op && op.includes(":")) op = decrypt(op) } catch { /* not encrypted */ }
    try { if (dic && dic.includes(":")) dic = decrypt(dic) } catch { /* not encrypted or PO (plain) */ }

    const isOsvc = b.typ_brigadnika === "osvc"
    const typLabel = isOsvc ? "Fakturant (OSVČ)" : "Brigádník"

    const change = lastTypChange.get(b.id)
    const labelTyp = (v: string | null) => v === "osvc" ? "OSVČ" : v === "brigadnik" ? "brigádník" : (v ?? "—")
    const typPoznamka = change
      ? `Typ změněn ${new Date(change.at).toLocaleDateString("cs-CZ")} z ${labelTyp(change.from)} na ${labelTyp(change.to)}`
      : ""

    ws.addRow({
      jmeno: b.jmeno,
      prijmeni: b.prijmeni,
      typ: typLabel,
      narodnost: b.narodnost ?? "",
      rodne_cislo: isOsvc ? "" : rc,
      datum_narozeni: b.datum_narozeni ?? "",
      adresa: b.adresa ?? "",
      cislo_op: isOsvc ? "" : op,
      zp: b.zdravotni_pojistovna ?? "",
      ucet: b.cislo_uctu ? `${b.cislo_uctu}/${b.kod_banky ?? ""}` : "",
      vzdelani: b.vzdelani ?? "",
      ruzove: isOsvc ? "—" : (b.chce_ruzove_prohlaseni ? "Ano" : "Ne"),
      osvc_ico: isOsvc ? (b.osvc_ico ?? "") : "",
      osvc_dic: isOsvc ? dic : "",
      osvc_adresa: isOsvc ? (b.osvc_fakturacni_adresa ?? "") : "",
      typ_poznamka: typPoznamka,
    })
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=karty_zamestnancu_${mesic}.xlsx`,
    },
  })
}
