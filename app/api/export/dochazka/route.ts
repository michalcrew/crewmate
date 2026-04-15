import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import ExcelJS from "exceljs"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const mesic = request.nextUrl.searchParams.get("mesic")
  if (!mesic) return NextResponse.json({ error: "Missing mesic" }, { status: 400 })

  const start = `${mesic}-01`
  const [y, m] = mesic.split("-").map(Number)
  const end = `${y}-${String((m ?? 0) + 1).padStart(2, "0")}-01`

  const { data } = await supabase
    .from("dochazka")
    .select(`
      prichod, odchod, hodin_celkem,
      brigadnik:brigadnici(jmeno, prijmeni, rodne_cislo),
      akce:akce!inner(nazev, datum),
      prirazeni_rel:prirazeni!inner(pozice)
    `)
    .gte("akce.datum", start)
    .lt("akce.datum", end)

  const rows = data ?? []

  const wb = new ExcelJS.Workbook()

  // Sheet 1: Docházka per směna
  const ws1 = wb.addWorksheet("Docházka")
  ws1.columns = [
    { header: "Akce", key: "akce", width: 25 },
    { header: "Datum", key: "datum", width: 12 },
    { header: "Brigádník", key: "brigadnik", width: 25 },
    { header: "Pozice", key: "pozice", width: 15 },
    { header: "Příchod", key: "prichod", width: 10 },
    { header: "Odchod", key: "odchod", width: 10 },
    { header: "Hodin celkem", key: "hodin", width: 13 },
  ]

  for (const r of rows) {
    const b = r.brigadnik as unknown as { jmeno: string; prijmeni: string } | null
    const a = r.akce as unknown as { nazev: string; datum: string } | null
    const p = r.prirazeni_rel as unknown as { pozice: string | null } | null
    ws1.addRow({
      akce: a?.nazev,
      datum: a?.datum,
      brigadnik: b ? `${b.prijmeni} ${b.jmeno}` : "",
      pozice: p?.pozice ?? "",
      prichod: r.prichod?.slice(0, 5) ?? "",
      odchod: r.odchod?.slice(0, 5) ?? "",
      hodin: r.hodin_celkem,
    })
  }

  // Sheet 2: Souhrn per brigádník
  const ws2 = wb.addWorksheet("Souhrn")
  ws2.columns = [
    { header: "Brigádník", key: "brigadnik", width: 25 },
    { header: "Počet směn", key: "smeny", width: 12 },
    { header: "Hodin celkem", key: "hodin", width: 13 },
  ]

  const agg = new Map<string, { name: string; smeny: number; hodin: number }>()
  for (const r of rows) {
    const b = r.brigadnik as unknown as { jmeno: string; prijmeni: string } | null
    if (!b) continue
    const key = `${b.prijmeni} ${b.jmeno}`
    const e = agg.get(key)
    if (e) { e.smeny++; e.hodin += Number(r.hodin_celkem ?? 0) }
    else agg.set(key, { name: key, smeny: 1, hodin: Number(r.hodin_celkem ?? 0) })
  }
  for (const [, v] of agg) {
    ws2.addRow({ brigadnik: v.name, smeny: v.smeny, hodin: v.hodin })
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=dochazka_${mesic}.xlsx`,
    },
  })
}
