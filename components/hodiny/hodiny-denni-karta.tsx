"use client"

import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, MapPin, Plus, Trash2 } from "lucide-react"
import { formatMinutes } from "@/lib/utils/minutes"
import { deleteHodiny, type HodinyRowWithMeta, type AktivniNabidkaPickerItem } from "@/lib/actions/naborar-hodiny"
import { toast } from "sonner"
import { PridatHodinyDialog } from "./pridat-hodiny-dialog"
import { EditHodinyDialog } from "./edit-hodiny-dialog"

interface Props {
  datum: string
  entries: HodinyRowWithMeta[]
  aktivniNabidky: AktivniNabidkaPickerItem[]
  showNaborar?: boolean // admin Tým view
  defaultExpanded?: boolean
}

function mistoLabel(m: string | null): string {
  if (m === "kancelar") return "Kancelář"
  if (m === "remote") return "Remote"
  if (m === "akce") return "Na akci"
  return "—"
}

/**
 * F-0019 — v2: jeden den = jedna karta s multi-entry seznamem.
 * Collapsible header s sum, expandovaný list entries s edit/delete.
 */
export function HodinyDenniKarta({
  datum,
  entries,
  aktivniNabidky,
  showNaborar = false,
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [isPending, startTransition] = useTransition()

  const totalMinut = entries.reduce((s, e) => s + Number(e.trvani_minut || 0), 0)
  const dateObj = new Date(datum)
  const dateLabel = dateObj.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "long", year: "numeric" })

  const tooMany = entries.length > 20

  async function handleDelete(id: string) {
    if (!confirm("Opravdu smazat tento záznam?")) return
    startTransition(async () => {
      const res = await deleteHodiny(id)
      if ("error" in res) toast.error(res.error)
      else toast.success("Záznam smazán")
    })
  }

  return (
    <Card className="shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-accent/40 rounded-t-xl min-h-[48px]"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="font-medium truncate">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tooMany && (
            <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
              {entries.length}+ záznamů
            </Badge>
          )}
          <span className="text-sm font-semibold">{formatMinutes(totalMinut)}</span>
          <span className="text-xs text-muted-foreground">
            / {entries.length} {entries.length === 1 ? "záznam" : entries.length < 5 ? "záznamy" : "záznamů"}
          </span>
        </div>
      </button>

      {expanded && (
        <CardContent className="pt-0 space-y-2 border-t">
          {entries.map((e) => {
            const isNabidka = e.typ_zaznamu === "nabidka"
            const zakazkaNazev = isNabidka ? (e.nabidka?.nazev ?? "Smazaná zakázka") : "Ostatní"
            return (
              <div key={e.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 py-3 border-b last:border-0">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{formatMinutes(Number(e.trvani_minut))}</span>
                    <Badge
                      variant="outline"
                      className={isNabidka
                        ? "bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs"
                        : "bg-gray-500/10 text-gray-600 border-gray-500/20 text-xs"}
                    >
                      {zakazkaNazev}
                    </Badge>
                    {e.misto_prace && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <MapPin className="h-3 w-3" />
                        {mistoLabel(e.misto_prace)}
                      </Badge>
                    )}
                    {e.je_zpetny_zapis && (
                      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-xs" title={e.duvod_zpozdeni ?? ""}>
                        Zpětný zápis
                      </Badge>
                    )}
                  </div>
                  {showNaborar && e.naborar && (
                    <p className="text-xs text-muted-foreground">{e.naborar.jmeno} {e.naborar.prijmeni}</p>
                  )}
                  {e.napln_prace && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{e.napln_prace}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <EditHodinyDialog hodina={e} aktivniNabidky={aktivniNabidky} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(e.id)}
                    disabled={isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}

          <div className="pt-2">
            <PridatHodinyDialog
              datum={datum}
              aktivniNabidky={aktivniNabidky}
              trigger={
                <Button type="button" variant="outline" size="sm" className="w-full">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Přidat další záznam pro tento den
                </Button>
              }
            />
          </div>
        </CardContent>
      )}
    </Card>
  )
}
