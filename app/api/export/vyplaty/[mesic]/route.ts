import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { getVyplataMesic, type VyplataMesicData } from "@/lib/actions/vyplata"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ mesic: string }> },
) {
  const { mesic } = await ctx.params
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesic)) {
    return NextResponse.json({ error: "Neplatný měsíc" }, { status: 400 })
  }

  const result = await getVyplataMesic(mesic)
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 })
  }

  const wb = await buildWorkbook(result.data)
  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=vyplaty_${mesic}.xlsx`,
    },
  })
}

const COLS_PER_AKCE = 6 // Přích | Odch | Hod | Sazba | Bonus | Celkem
const SECTION_BG = "FFE5E7EB" // šedá pro section / celkové řádky
const TOTAL_BG = "FFD1FAE5" // světle zelená pro grand total
const HEADER_BG = "FFF3F4F6"

function colLetter(n: number): string {
  let s = ""
  let x = n
  while (x > 0) {
    const r = (x - 1) % 26
    s = String.fromCharCode(65 + r) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

function fmtMesic(mesic: string): string {
  const [y, m] = mesic.split("-").map(Number)
  if (!y || !m) return mesic
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })
}

function fmtDatum(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`
}

function fmtTime(t: string | null): string {
  return t ? t.slice(0, 5) : ""
}

async function buildWorkbook(data: VyplataMesicData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Crewmate"
  wb.created = new Date()
  const ws = wb.addWorksheet("Výplaty", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 5 }],
  })

  const akceCount = data.akce.length
  const totalCols = 1 + akceCount * COLS_PER_AKCE + 1
  const lastColL = colLetter(totalCols)

  // Sloupce - šířky
  ws.columns = [
    { width: 28 },
    ...data.akce.flatMap(() => [
      { width: 8 }, // přích
      { width: 8 }, // odch
      { width: 7 }, // hod
      { width: 10 }, // sazba
      { width: 10 }, // bonus
      { width: 12 }, // celkem akce
    ]),
    { width: 14 }, // celkem osoba
  ]

  let r = 1

  // Row 1: Title
  ws.getCell(r, 1).value = `Výplatní přehled — ${fmtMesic(data.mesic)}`
  ws.mergeCells(`A${r}:${lastColL}${r}`)
  ws.getRow(r).font = { bold: true, size: 14 }
  ws.getRow(r).height = 22
  r++

  // Lock info (pokud je)
  if (data.uzamceno) {
    const by = data.uzamceno.by
      ? `${data.uzamceno.by.jmeno ?? ""} ${data.uzamceno.by.prijmeni ?? ""}`.trim()
      : ""
    ws.getCell(r, 1).value = `Uzamčeno ${new Date(data.uzamceno.at).toLocaleDateString("cs-CZ")}${by ? ` — ${by}` : ""}`
    ws.mergeCells(`A${r}:${lastColL}${r}`)
    ws.getRow(r).font = { italic: true, color: { argb: "FF6B7280" }, size: 10 }
    r++
  }

  // Empty row
  r++

  // Section: DPP
  if (data.dpp.length > 0) {
    r = renderSection(
      ws,
      r,
      "DPP — výplaty",
      data.dpp,
      data.akce,
      data.totalDpp,
      "Celkem DPP (výplaty)",
      lastColL,
    )
    r++ // blank line between sections
  }

  // Section: OSVČ
  if (data.osvc.length > 0) {
    r = renderSection(
      ws,
      r,
      "OSVČ — fakturace",
      data.osvc,
      data.akce,
      data.totalOsvc,
      "Celkem OSVČ (fakturace)",
      lastColL,
    )
    r++
  }

  // Grand total
  if (data.dpp.length > 0 && data.osvc.length > 0) {
    const grandRow = ws.getRow(r)
    grandRow.getCell(1).value = "CELKEM (DPP + OSVČ)"
    grandRow.getCell(totalCols).value = data.totalDpp + data.totalOsvc
    grandRow.getCell(totalCols).numFmt = '#,##0" Kč"'
    ws.mergeCells(`A${r}:${colLetter(totalCols - 1)}${r}`)
    grandRow.font = { bold: true, size: 12 }
    grandRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: TOTAL_BG },
    }
    grandRow.alignment = { vertical: "middle" }
    grandRow.height = 22
    grandRow.getCell(totalCols).alignment = { horizontal: "right" }
  }

  return wb
}

function renderSection(
  ws: ExcelJS.Worksheet,
  startRow: number,
  sectionTitle: string,
  rows: VyplataMesicData["dpp"],
  akce: VyplataMesicData["akce"],
  sectionTotal: number,
  totalLabel: string,
  lastColL: string,
): number {
  let r = startRow
  const totalCols = 1 + akce.length * COLS_PER_AKCE + 1

  // Section header (full-width merged)
  ws.getCell(r, 1).value = sectionTitle
  ws.mergeCells(`A${r}:${lastColL}${r}`)
  ws.getRow(r).font = { bold: true, size: 12 }
  ws.getRow(r).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: SECTION_BG },
  }
  ws.getRow(r).height = 20
  r++

  // Akce headers (každá akce zabírá 6 sloupců, merged)
  const akceHeaderRow = ws.getRow(r)
  akceHeaderRow.getCell(1).value = "Brigádník"
  akce.forEach((a, idx) => {
    const startCol = 2 + idx * COLS_PER_AKCE
    const endCol = startCol + COLS_PER_AKCE - 1
    const cell = akceHeaderRow.getCell(startCol)
    cell.value = `${a.nazev} (${fmtDatum(a.datum)})`
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    ws.mergeCells(r, startCol, r, endCol)
  })
  akceHeaderRow.getCell(totalCols).value = "Celkem"
  akceHeaderRow.font = { bold: true, size: 10 }
  akceHeaderRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_BG },
  }
  akceHeaderRow.height = 30
  applyBorderToRow(ws, r, totalCols)
  r++

  // Sub-headers
  const subHeaderRow = ws.getRow(r)
  subHeaderRow.getCell(1).value = ""
  akce.forEach((_, idx) => {
    const startCol = 2 + idx * COLS_PER_AKCE
    subHeaderRow.getCell(startCol + 0).value = "Příchod"
    subHeaderRow.getCell(startCol + 1).value = "Odchod"
    subHeaderRow.getCell(startCol + 2).value = "Hod."
    subHeaderRow.getCell(startCol + 3).value = "Sazba"
    subHeaderRow.getCell(startCol + 4).value = "Bonus"
    subHeaderRow.getCell(startCol + 5).value = "Celkem"
  })
  subHeaderRow.getCell(totalCols).value = ""
  subHeaderRow.font = { bold: true, size: 9, color: { argb: "FF374151" } }
  subHeaderRow.alignment = { horizontal: "center", vertical: "middle" }
  subHeaderRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_BG },
  }
  applyBorderToRow(ws, r, totalCols)
  r++

  // Data rows
  for (const row of rows) {
    const dataRow = ws.getRow(r)
    dataRow.getCell(1).value = `${row.prijmeni} ${row.jmeno}`
    akce.forEach((a, idx) => {
      const startCol = 2 + idx * COLS_PER_AKCE
      const c = row.cells[a.id]
      if (!c) return
      dataRow.getCell(startCol + 0).value = fmtTime(c.prichod) || ""
      dataRow.getCell(startCol + 1).value = fmtTime(c.odchod) || ""
      if (c.hodinCelkem !== null && c.hodinCelkem !== undefined) {
        dataRow.getCell(startCol + 2).value = Number(c.hodinCelkem)
        dataRow.getCell(startCol + 2).numFmt = "0.0"
      }
      if (c.sazbaHodinova !== null && c.sazbaHodinova !== undefined) {
        dataRow.getCell(startCol + 3).value = Number(c.sazbaHodinova)
        dataRow.getCell(startCol + 3).numFmt = '#,##0" Kč/h"'
      }
      if (c.extraOdmenaKc !== null && c.extraOdmenaKc !== undefined && c.extraOdmenaKc > 0) {
        dataRow.getCell(startCol + 4).value = Number(c.extraOdmenaKc)
        dataRow.getCell(startCol + 4).numFmt = '#,##0" Kč"'
      }
      if (c.celkemZaAkci > 0) {
        dataRow.getCell(startCol + 5).value = c.celkemZaAkci
        dataRow.getCell(startCol + 5).numFmt = '#,##0" Kč"'
      }
    })
    dataRow.getCell(totalCols).value = row.rowTotal
    dataRow.getCell(totalCols).numFmt = '#,##0" Kč"'
    dataRow.getCell(totalCols).font = { bold: true }
    applyBorderToRow(ws, r, totalCols)
    r++
  }

  // Total row
  const totalRow = ws.getRow(r)
  totalRow.getCell(1).value = totalLabel
  // Per-akce sums
  akce.forEach((a, idx) => {
    const startCol = 2 + idx * COLS_PER_AKCE
    const sum = rows.reduce((s, row) => s + (row.cells[a.id]?.celkemZaAkci ?? 0), 0)
    if (sum > 0) {
      const cell = totalRow.getCell(startCol + 5)
      cell.value = sum
      cell.numFmt = '#,##0" Kč"'
    }
  })
  totalRow.getCell(totalCols).value = sectionTotal
  totalRow.getCell(totalCols).numFmt = '#,##0" Kč"'
  totalRow.font = { bold: true }
  totalRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: SECTION_BG },
  }
  totalRow.height = 20
  applyBorderToRow(ws, r, totalCols)
  r++

  return r
}

function applyBorderToRow(ws: ExcelJS.Worksheet, rowNum: number, totalCols: number) {
  const row = ws.getRow(rowNum)
  for (let c = 1; c <= totalCols; c++) {
    row.getCell(c).border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    }
  }
}
