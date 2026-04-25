"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  upsertSazbaHodinova,
  upsertDyskoKc,
  type VyplataAkce,
  type VyplataCell,
  type VyplataMesicData,
  type VyplataRow,
} from "@/lib/actions/vyplata"
import { EditableNumberCell } from "@/components/vyplata/editable-number-cell"

const COLS_PER_AKCE = 6 // příchod, odchod, hodiny, sazba, bonus, celkem

interface Props {
  data: VyplataMesicData
}

type CellPatch = Partial<Pick<VyplataCell, "sazbaHodinova" | "extraOdmenaKc">>

type SaveHandler = (
  prirazeniId: string,
  newValue: number | null,
) => Promise<
  | { success: true; serverValue: number | null }
  | { error: string; locked?: boolean }
>

function recomputeCellTotal(c: VyplataCell): number {
  return (c.hodinCelkem ?? 0) * (c.sazbaHodinova ?? 0) + (c.extraOdmenaKc ?? 0)
}

/**
 * Imutabilně aplikuje patch na buňku (per prirazeniId), přepočítá celkem za
 * akci v té buňce, řádkový total a součet sekce. Používá se pro instant
 * UI feedback po editaci sazby / bonusu, bez čekání na server.
 */
function applyCellPatch(
  data: VyplataMesicData,
  prirazeniId: string,
  patch: CellPatch,
): VyplataMesicData {
  const updateRows = (rows: VyplataRow[]): { rows: VyplataRow[]; touched: boolean } => {
    let touched = false
    const newRows = rows.map((row) => {
      let cellTouched = false
      const newCells: Record<string, VyplataCell> = {}
      for (const [akceId, cell] of Object.entries(row.cells)) {
        if (cell.prirazeniId === prirazeniId) {
          const updated: VyplataCell = { ...cell, ...patch }
          updated.celkemZaAkci = recomputeCellTotal(updated)
          newCells[akceId] = updated
          cellTouched = true
        } else {
          newCells[akceId] = cell
        }
      }
      if (!cellTouched) return row
      touched = true
      const newRowTotal = Object.values(newCells).reduce(
        (s, c) => s + c.celkemZaAkci,
        0,
      )
      return { ...row, cells: newCells, rowTotal: newRowTotal }
    })
    return { rows: newRows, touched }
  }

  const dppResult = updateRows(data.dpp)
  const osvcResult = updateRows(data.osvc)
  if (!dppResult.touched && !osvcResult.touched) return data

  return {
    ...data,
    dpp: dppResult.rows,
    osvc: osvcResult.rows,
    totalDpp: dppResult.rows.reduce((s, r) => s + r.rowTotal, 0),
    totalOsvc: osvcResult.rows.reduce((s, r) => s + r.rowTotal, 0),
  }
}

const fmtKc = (n: number) =>
  n.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč"

const fmtHod = (n: number | null) =>
  n === null || n === undefined ? "—" : `${n.toFixed(1)}h`

const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : "—")

const fmtDatum = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()}. ${d.getMonth() + 1}.`
}

type TypFilter = "vse" | "dpp" | "osvc"

export function VyplataTabulka({ data: initialData }: Props) {
  const [akceFilter, setAkceFilter] = useState<string>("vse")
  const [typFilter, setTypFilter] = useState<TypFilter>("vse")
  // Lokální kopie dat pro instant recompute. Server save běží na pozadí;
  // pokud selže, revertujeme na předchozí snapshot.
  const [data, setData] = useState<VyplataMesicData>(initialData)

  // Resync když se změní initialData (např. přepnutí měsíce, navigace)
  useEffect(() => {
    setData(initialData)
  }, [initialData])

  const handleSazbaSave = useCallback(
    async (prirazeniId: string, newSazba: number | null) => {
      const before = data
      setData((d) => applyCellPatch(d, prirazeniId, { sazbaHodinova: newSazba }))
      const result = await upsertSazbaHodinova(prirazeniId, newSazba)
      if ("error" in result) {
        setData(before) // revert
      }
      return result
    },
    [data],
  )

  const handleBonusSave = useCallback(
    async (prirazeniId: string, newBonus: number | null) => {
      const before = data
      setData((d) => applyCellPatch(d, prirazeniId, { extraOdmenaKc: newBonus }))
      const result = await upsertDyskoKc(prirazeniId, newBonus)
      if ("error" in result) {
        setData(before) // revert
      }
      return result
    },
    [data],
  )

  const filteredAkce = useMemo<VyplataAkce[]>(() => {
    if (akceFilter === "vse") return data.akce
    return data.akce.filter((a) => a.id === akceFilter)
  }, [data.akce, akceFilter])

  const { dppVisible, osvcVisible, totalDppVisible, totalOsvcVisible } = useMemo(() => {
    const recompute = (rows: VyplataRow[]) => {
      // Filtr akce: řádek se zobrazí jen pokud má aspoň 1 cell ve filtrovaných akcích
      if (akceFilter === "vse") {
        return rows.map((r) => ({ ...r, rowTotal: r.rowTotal }))
      }
      const filtered = rows
        .map<VyplataRow>((r) => {
          const cells: Record<string, VyplataCell> = {}
          let total = 0
          for (const a of filteredAkce) {
            const c = r.cells[a.id]
            if (c) {
              cells[a.id] = c
              total += c.celkemZaAkci
            }
          }
          return { ...r, cells, rowTotal: total }
        })
        .filter((r) => Object.keys(r.cells).length > 0)
      return filtered
    }

    const dpp = typFilter === "osvc" ? [] : recompute(data.dpp)
    const osvc = typFilter === "dpp" ? [] : recompute(data.osvc)
    return {
      dppVisible: dpp,
      osvcVisible: osvc,
      totalDppVisible: dpp.reduce((s, r) => s + r.rowTotal, 0),
      totalOsvcVisible: osvc.reduce((s, r) => s + r.rowTotal, 0),
    }
  }, [data.dpp, data.osvc, akceFilter, typFilter, filteredAkce])

  const akceColumns = filteredAkce
  const totalAkceColumns = akceColumns.length
  const isLocked = !!data.uzamceno

  return (
    <Card>
      <CardContent className="p-0">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-b">
          <span className="text-xs font-medium text-muted-foreground">Filtr:</span>
          <div className="flex gap-1">
            {[
              { v: "vse" as const, label: "Vše" },
              { v: "dpp" as const, label: "DPP" },
              { v: "osvc" as const, label: "OSVČ" },
            ].map((o) => (
              <Button
                key={o.v}
                variant={typFilter === o.v ? "default" : "outline"}
                size="sm"
                onClick={() => setTypFilter(o.v)}
              >
                {o.label}
              </Button>
            ))}
          </div>
          <div className="h-6 w-px bg-border mx-1" />
          <select
            value={akceFilter}
            onChange={(e) => setAkceFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="vse">Všechny akce ({data.akce.length})</option>
            {data.akce.map((a) => (
              <option key={a.id} value={a.id}>
                {fmtDatum(a.datum)} — {a.nazev}
              </option>
            ))}
          </select>
        </div>

        {/* Horizontal-scroll pivot table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            {/* Header: akce (column groups) + per-akce sub-columns */}
            <thead className="bg-muted/50">
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 bg-muted/50 border-b border-r px-3 py-2 text-left font-medium whitespace-nowrap min-w-[200px]"
                >
                  Brigádník
                </th>
                {akceColumns.map((a) => (
                  <th
                    key={a.id}
                    colSpan={COLS_PER_AKCE}
                    className="border-b border-r px-2 py-1.5 text-center text-xs font-medium"
                  >
                    <div className="truncate max-w-[260px] mx-auto" title={a.nazev}>
                      {a.nazev}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      {fmtDatum(a.datum)}
                    </div>
                  </th>
                ))}
                <th
                  rowSpan={2}
                  className="sticky right-0 z-20 bg-muted/50 border-b border-l px-3 py-2 text-right font-semibold whitespace-nowrap min-w-[110px]"
                >
                  Celkem
                </th>
              </tr>
              <tr>
                {akceColumns.map((a) => (
                  <SubHeader key={a.id} />
                ))}
              </tr>
            </thead>

            <tbody>
              {dppVisible.length > 0 && (
                <>
                  <SectionHeader
                    label="DPP"
                    colSpan={1 + totalAkceColumns * COLS_PER_AKCE + 1}
                  />
                  {dppVisible.map((r) => (
                    <DataRow
                      key={r.brigadnikId}
                      row={r}
                      akce={akceColumns}
                      locked={isLocked}
                      onSazbaSave={handleSazbaSave}
                      onBonusSave={handleBonusSave}
                    />
                  ))}
                  <TotalRow
                    label="Celkem DPP (výplaty)"
                    total={totalDppVisible}
                    rows={dppVisible}
                    akce={akceColumns}
                    variant="dpp"
                  />
                </>
              )}

              {osvcVisible.length > 0 && (
                <>
                  <SectionHeader
                    label="OSVČ"
                    colSpan={1 + totalAkceColumns * COLS_PER_AKCE + 1}
                  />
                  {osvcVisible.map((r) => (
                    <DataRow
                      key={r.brigadnikId}
                      row={r}
                      akce={akceColumns}
                      locked={isLocked}
                      onSazbaSave={handleSazbaSave}
                      onBonusSave={handleBonusSave}
                    />
                  ))}
                  <TotalRow
                    label="Celkem OSVČ (fakturace)"
                    total={totalOsvcVisible}
                    rows={osvcVisible}
                    akce={akceColumns}
                    variant="osvc"
                  />
                </>
              )}

              {dppVisible.length === 0 && osvcVisible.length === 0 && (
                <tr>
                  <td
                    colSpan={1 + totalAkceColumns * COLS_PER_AKCE + 1}
                    className="py-8 text-center text-muted-foreground text-sm"
                  >
                    Žádní brigádníci po aplikaci filtrů.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function SubHeader() {
  return (
    <>
      <th className="border-b px-2 py-1.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
        Přích.
      </th>
      <th className="border-b px-2 py-1.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
        Odch.
      </th>
      <th className="border-b px-2 py-1.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
        Hod.
      </th>
      <th className="border-b px-2 py-1.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
        Sazba
      </th>
      <th className="border-b px-2 py-1.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
        Bonus
      </th>
      <th className="border-b border-r px-2 py-1.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
        Celkem
      </th>
    </>
  )
}

function SectionHeader({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="bg-muted/30 border-b px-3 py-1.5 text-xs font-semibold tracking-wider text-muted-foreground"
      >
        {label}
      </td>
    </tr>
  )
}

function DataRow({
  row,
  akce,
  locked,
  onSazbaSave,
  onBonusSave,
}: {
  row: VyplataRow
  akce: VyplataAkce[]
  locked: boolean
  onSazbaSave: SaveHandler
  onBonusSave: SaveHandler
}) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="sticky left-0 z-10 bg-background border-b border-r px-3 py-2 font-medium whitespace-nowrap">
        <Link
          href={`/app/brigadnici/${row.brigadnikId}`}
          className="hover:underline"
        >
          {row.prijmeni} {row.jmeno}
        </Link>
      </td>
      {akce.map((a) => {
        const c = row.cells[a.id]
        return (
          <Cell
            key={a.id}
            cell={c}
            locked={locked}
            onSazbaSave={onSazbaSave}
            onBonusSave={onBonusSave}
          />
        )
      })}
      <td className="sticky right-0 z-10 bg-background border-b border-l px-3 py-2 text-right font-semibold whitespace-nowrap">
        {fmtKc(row.rowTotal)}
      </td>
    </tr>
  )
}

function Cell({
  cell,
  locked,
  onSazbaSave,
  onBonusSave,
}: {
  cell: VyplataCell | undefined
  locked: boolean
  onSazbaSave: SaveHandler
  onBonusSave: SaveHandler
}) {
  if (!cell) {
    return (
      <>
        <EmptyCell />
        <EmptyCell />
        <EmptyCell />
        <EmptyCell />
        <EmptyCell />
        <EmptyCell last />
      </>
    )
  }
  return (
    <>
      <td className="border-b px-2 py-2 text-center text-xs tabular-nums whitespace-nowrap">
        {fmtTime(cell.prichod)}
      </td>
      <td className="border-b px-2 py-2 text-center text-xs tabular-nums whitespace-nowrap">
        {fmtTime(cell.odchod)}
      </td>
      <td className="border-b px-2 py-2 text-center text-xs tabular-nums whitespace-nowrap">
        {fmtHod(cell.hodinCelkem)}
      </td>
      <td className="border-b px-1 py-1 whitespace-nowrap min-w-[80px]">
        <EditableNumberCell
          value={cell.sazbaHodinova}
          formatDisplay={(v) => fmtKc(v ?? 0).replace(" Kč", "")}
          inputSuffix="Kč/h"
          emptyDisplay="— Kč/h"
          ariaLabel="Sazba Kč/hod"
          disabled={locked}
          onSave={(v) => onSazbaSave(cell.prirazeniId, v)}
        />
      </td>
      <td className="border-b px-1 py-1 whitespace-nowrap min-w-[80px]">
        <EditableNumberCell
          value={cell.extraOdmenaKc}
          formatDisplay={(v) => (v && v > 0 ? fmtKc(v) : "—")}
          ariaLabel="Bonus"
          disabled={locked}
          onSave={(v) => onBonusSave(cell.prirazeniId, v)}
        />
      </td>
      <td
        className={cn(
          "border-b border-r px-2 py-2 text-right text-xs tabular-nums whitespace-nowrap",
          cell.celkemZaAkci > 0 && "font-medium",
        )}
      >
        {cell.celkemZaAkci > 0 ? fmtKc(cell.celkemZaAkci) : "—"}
      </td>
    </>
  )
}

function EmptyCell({ last = false }: { last?: boolean }) {
  return (
    <td
      className={cn(
        "border-b px-2 py-2 text-center text-xs text-muted-foreground/50",
        last && "border-r",
      )}
    >
      ·
    </td>
  )
}

function TotalRow({
  label,
  total,
  rows,
  akce,
  variant,
}: {
  label: string
  total: number
  rows: VyplataRow[]
  akce: VyplataAkce[]
  variant: "dpp" | "osvc"
}) {
  // Sloupcové součty per akce
  const perAkce = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of akce) {
      let s = 0
      for (const r of rows) s += r.cells[a.id]?.celkemZaAkci ?? 0
      map.set(a.id, s)
    }
    return map
  }, [rows, akce])

  const bg = variant === "dpp" ? "bg-blue-500/10" : "bg-purple-500/10"

  return (
    <tr className={cn("font-semibold", bg)}>
      <td className="sticky left-0 z-10 border-b-2 border-t border-r px-3 py-2 whitespace-nowrap bg-inherit">
        {label}
      </td>
      {akce.map((a) => (
        <td
          key={a.id}
          colSpan={COLS_PER_AKCE}
          className="border-b-2 border-t border-r px-2 py-2 text-right text-xs tabular-nums whitespace-nowrap"
        >
          {fmtKc(perAkce.get(a.id) ?? 0)}
        </td>
      ))}
      <td className="sticky right-0 z-10 border-b-2 border-t border-l px-3 py-2 text-right whitespace-nowrap bg-inherit">
        {fmtKc(total)}
      </td>
    </tr>
  )
}
