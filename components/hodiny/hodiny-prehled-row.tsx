"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { formatMinutes } from "@/lib/utils/minutes"
import type { PrehledZakazkaRow } from "@/lib/actions/naborar-hodiny"

interface Props {
  row: PrehledZakazkaRow
}

/**
 * F-0019 — Row v přehledu zakázek s expand per-náborářka breakdown.
 */
export function HodinyPrehledRow({ row }: Props) {
  const [expanded, setExpanded] = useState(false)

  const naklad = Number(row.naklad_kc || 0).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })

  return (
    <>
      <tr
        className="border-b hover:bg-accent/30 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </td>
        <td className="px-4 py-3 font-medium text-sm">{row.zakazka_nazev}</td>
        <td className="px-4 py-3 text-right text-sm font-semibold">{formatMinutes(Number(row.celkem_minut))}</td>
        <td className="px-4 py-3 text-right text-xs text-muted-foreground">{row.celkem_minut} min</td>
        <td className="px-4 py-3 text-right text-sm font-semibold">{naklad} Kč</td>
        <td className="px-4 py-3 text-right text-sm">{row.pocet_naborarek}</td>
      </tr>

      {expanded && row.breakdown_per_naborar.length > 0 && (
        <tr className="bg-muted/30">
          <td></td>
          <td colSpan={5} className="px-4 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium py-1.5">Náborářka</th>
                  <th className="text-right font-medium py-1.5">Celkem</th>
                  <th className="text-right font-medium py-1.5">Minut</th>
                  <th className="text-right font-medium py-1.5">Sazba</th>
                  <th className="text-right font-medium py-1.5">Náklad</th>
                </tr>
              </thead>
              <tbody>
                {row.breakdown_per_naborar.map((n) => (
                  <tr key={n.user_id} className="border-t">
                    <td className="py-1.5">{n.jmeno} {n.prijmeni}</td>
                    <td className="text-right py-1.5 font-medium">{formatMinutes(n.minut)}</td>
                    <td className="text-right py-1.5 text-muted-foreground">{n.minut}</td>
                    <td className="text-right py-1.5 text-muted-foreground">
                      {n.sazba_kc_hod !== null ? `${n.sazba_kc_hod.toLocaleString("cs-CZ")} Kč/h` : "—"}
                    </td>
                    <td className="text-right py-1.5 font-medium">
                      {n.sazba_kc_hod !== null
                        ? `${Number(n.naklad_kc).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}
