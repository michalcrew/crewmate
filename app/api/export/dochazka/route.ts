import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import ExcelJS from "exceljs"

// F-0018: Rozšíření existujícího exportu o měsíční filter, nové sloupce
// (Hodnocení, Poznámka, Status prirazeni) a role check (admin + náborářka).
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Role check: admin nebo naborar. Admin client fallback — pattern z MD-1
  // (getCurrentUserRole). RLS na `users` table může vrátit null i pro
  // legitimního přihlášeného usera (edge case stale session / race).
  const admin = createAdminClient()
  const { data: internalUser } = await admin
    .from("users")
    .select("role")
    .eq("auth_user_id", user.id)
    .single()
  if (!internalUser || !["admin", "naborar"].includes((internalUser as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const mesic = request.nextUrl.searchParams.get("mesic") // optional YYYY-MM

  // Build query
  let query = admin
    .from("dochazka")
    .select(`
      prichod, odchod, hodin_celkem, hodnoceni, poznamka,
      brigadnik:brigadnici(jmeno, prijmeni, typ_brigadnika),
      akce:akce!inner(nazev, datum),
      prirazeni_rel:prirazeni!inner(role, status)
    `)

  // Apply month filter if provided
  if (mesic) {
    if (!/^\d{4}-\d{2}$/.test(mesic)) {
      return NextResponse.json({ error: "Invalid mesic format (YYYY-MM)" }, { status: 400 })
    }
    const [y, m] = mesic.split("-").map(Number)
    if (!y || !m || m < 1 || m > 12) {
      return NextResponse.json({ error: "Invalid mesic" }, { status: 400 })
    }
    const start = `${mesic}-01`
    const nextM = m === 12 ? 1 : m + 1
    const nextY = m === 12 ? y + 1 : y
    const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`
    query = query.gte("akce.datum", start).lt("akce.datum", end)
  }

  const { data } = await query
  type Row = {
    prichod: string | null
    odchod: string | null
    hodin_celkem: number | null
    hodnoceni: number | null
    poznamka: string | null
    brigadnik: { jmeno: string; prijmeni: string; typ_brigadnika: string | null } | null
    akce: { nazev: string; datum: string } | null
    prirazeni_rel: { role: string | null; status: string | null } | null
  }
  const rows = (data ?? []) as unknown as Row[]

  // Sort: akce.datum ASC, brigadnik.prijmeni ASC
  rows.sort((a, b) => {
    const d = (a.akce?.datum ?? "").localeCompare(b.akce?.datum ?? "")
    if (d !== 0) return d
    return (a.brigadnik?.prijmeni ?? "").localeCompare(b.brigadnik?.prijmeni ?? "", "cs")
  })

  const wb = new ExcelJS.Workbook()

  const sheetName = mesic ? `Docházka ${mesic}` : "Docházka"
  const ws1 = wb.addWorksheet(sheetName)
  ws1.columns = [
    { header: "Jméno brigádníka", key: "brigadnik", width: 28 },
    { header: "Akce", key: "akce", width: 25 },
    { header: "Datum", key: "datum", width: 12 },
    { header: "Příchod", key: "prichod", width: 10 },
    { header: "Odchod", key: "odchod", width: 10 },
    { header: "Hodiny", key: "hodin", width: 10 },
    { header: "Hodnocení", key: "hodnoceni", width: 11 },
    { header: "Poznámka", key: "poznamka", width: 40 },
    { header: "Status", key: "status", width: 14 },
  ]
  ws1.getRow(1).font = { bold: true }
  ws1.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEEEEE" },
  }
  ws1.getColumn("hodin").numFmt = "0.00"

  for (const r of rows) {
    ws1.addRow({
      brigadnik: r.brigadnik ? `${r.brigadnik.prijmeni} ${r.brigadnik.jmeno}` : "",
      akce: r.akce?.nazev ?? "",
      datum: r.akce?.datum ?? "",
      prichod: r.prichod?.slice(0, 5) ?? "",
      odchod: r.odchod?.slice(0, 5) ?? "",
      hodin: r.hodin_celkem ?? null,
      hodnoceni: r.hodnoceni ?? "",
      poznamka: r.poznamka ?? "",
      status: r.prirazeni_rel?.status ?? "",
    })
  }

  // Sheet 2: Souhrn per brigádník
  const ws2 = wb.addWorksheet("Souhrn")
  ws2.columns = [
    { header: "Brigádník", key: "brigadnik", width: 28 },
    { header: "Počet směn", key: "smeny", width: 12 },
    { header: "Hodin celkem", key: "hodin", width: 13 },
  ]
  ws2.getRow(1).font = { bold: true }
  ws2.getColumn("hodin").numFmt = "0.00"

  const agg = new Map<string, { name: string; smeny: number; hodin: number }>()
  for (const r of rows) {
    const b = r.brigadnik
    if (!b) continue
    const key = `${b.prijmeni} ${b.jmeno}`
    const e = agg.get(key)
    if (e) {
      e.smeny++
      e.hodin += Number(r.hodin_celkem ?? 0)
    } else {
      agg.set(key, { name: key, smeny: 1, hodin: Number(r.hodin_celkem ?? 0) })
    }
  }
  for (const [, v] of agg) {
    ws2.addRow({ brigadnik: v.name, smeny: v.smeny, hodin: v.hodin })
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = mesic ? `crewmate-dochazka-${mesic}.xlsx` : "crewmate-dochazka.xlsx"
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=${filename}`,
    },
  })
}
