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
    .select("jmeno, prijmeni, rodne_cislo, datum_narozeni, adresa, cislo_op, zdravotni_pojistovna, cislo_uctu, kod_banky, vzdelani")
    .in("id", brigadnikIds)
    .order("prijmeni", { ascending: true })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Karty zaměstnanců")
  ws.columns = [
    { header: "Jméno", key: "jmeno", width: 15 },
    { header: "Příjmení", key: "prijmeni", width: 15 },
    { header: "Rodné číslo", key: "rodne_cislo", width: 15 },
    { header: "Datum narození", key: "datum_narozeni", width: 14 },
    { header: "Trvalé bydliště", key: "adresa", width: 30 },
    { header: "Číslo OP", key: "cislo_op", width: 12 },
    { header: "ZP", key: "zp", width: 10 },
    { header: "Číslo účtu", key: "ucet", width: 20 },
    { header: "Vzdělání", key: "vzdelani", width: 15 },
  ]

  for (const b of brigadnici ?? []) {
    let rc = b.rodne_cislo ?? ""
    let op = b.cislo_op ?? ""
    try { if (rc && rc.includes(":")) rc = decrypt(rc) } catch { /* not encrypted */ }
    try { if (op && op.includes(":")) op = decrypt(op) } catch { /* not encrypted */ }

    ws.addRow({
      jmeno: b.jmeno,
      prijmeni: b.prijmeni,
      rodne_cislo: rc,
      datum_narozeni: b.datum_narozeni ?? "",
      adresa: b.adresa ?? "",
      cislo_op: op,
      zp: b.zdravotni_pojistovna ?? "",
      ucet: b.cislo_uctu ? `${b.cislo_uctu}/${b.kod_banky ?? ""}` : "",
      vzdelani: b.vzdelani ?? "",
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
