"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, AlertTriangle, X } from "lucide-react"
import { addHodinyBulk, type AktivniNabidkaPickerItem, type TypZaznamu, type MistoPrace } from "@/lib/actions/naborar-hodiny"
import { parseMinutes, formatMinutes } from "@/lib/utils/minutes"
import { toast } from "sonner"

interface Props {
  datum?: string
  aktivniNabidky: AktivniNabidkaPickerItem[]
  onSuccess?: () => void
  trigger?: React.ReactNode
  defaultOpen?: boolean
}

type RowState = {
  key: string
  typ: TypZaznamu
  nabidka_id: string
  nabidka_query: string
  trvani: string
}

const emptyRow = (): RowState => ({
  key: Math.random().toString(36).slice(2),
  typ: "nabidka",
  nabidka_id: "",
  nabidka_query: "",
  trvani: "",
})

/**
 * F-0019 bulk — 1 datum + N řádků (zakázka/ostatní + trvání) + sdílený popis.
 * Progressive disclosure: nový prázdný řádek se objeví až po vyplnění předchozího.
 * Rationale: za 4h může náborářka pracovat na 5 zakázkách, jen potřebujeme správně
 * přiřadit čas a minutaž.
 */
export function PridatHodinyDialog({ datum, aktivniNabidky, onSuccess, trigger, defaultOpen = false }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [open, setOpen] = useState(defaultOpen)

  const [selDatum, setSelDatum] = useState(datum ?? today)
  const [mistoPrace, setMistoPrace] = useState<MistoPrace>("kancelar")
  const [naplnPrace, setNaplnPrace] = useState("")
  const [duvodZpozdeni, setDuvodZpozdeni] = useState("")
  const [rows, setRows] = useState<RowState[]>([emptyRow()])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const diffDays = useMemo(() => {
    const d = new Date(selDatum); const n = new Date()
    d.setHours(0, 0, 0, 0); n.setHours(0, 0, 0, 0)
    return Math.floor((n.getTime() - d.getTime()) / 86400000)
  }, [selDatum])
  const isLate = diffDays > 1
  const duvodRequired = diffDays > 7

  function rowMinutes(r: RowState): number | null {
    if (!r.trvani.trim()) return null
    return parseMinutes(r.trvani)
  }

  function isRowComplete(r: RowState): boolean {
    const min = rowMinutes(r)
    if (min === null || min <= 0) return false
    if (r.typ === "nabidka") return !!r.nabidka_id
    return true
  }

  // Progressive disclosure: pokud je poslední řádek kompletní, připojíme prázdný.
  useEffect(() => {
    if (rows.length === 0) return
    const last = rows[rows.length - 1]
    if (last && isRowComplete(last)) {
      setRows(prev => [...prev, emptyRow()])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const filledRows = rows.filter(isRowComplete)
  const totalMinut = filledRows.reduce((a, r) => a + (rowMinutes(r) ?? 0), 0)

  useEffect(() => {
    if (!open) {
      setRows([emptyRow()])
      setMistoPrace("kancelar")
      setNaplnPrace("")
      setDuvodZpozdeni("")
      setError("")
      setSelDatum(datum ?? today)
    }
  }, [open, datum, today])

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)))
  }

  function removeRow(key: string) {
    setRows(prev => {
      const filtered = prev.filter(r => r.key !== key)
      return filtered.length === 0 ? [emptyRow()] : filtered
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (filledRows.length === 0) {
      setError("Přidej alespoň jeden záznam s trváním")
      return
    }
    if (!naplnPrace.trim()) {
      setError("Vyplň náplň práce")
      return
    }
    if (duvodRequired && !duvodZpozdeni.trim()) {
      setError("Zpětný zápis starší 7 dní vyžaduje uvedení důvodu")
      return
    }
    if (totalMinut > 1440) {
      setError("Součet trvání přesahuje 24 hodin")
      return
    }

    const payload = filledRows.map(r => ({
      typ_zaznamu: r.typ,
      nabidka_id: r.typ === "nabidka" ? r.nabidka_id : null,
      trvani_minut: rowMinutes(r) as number,
    }))

    setPending(true)
    const result = await addHodinyBulk({
      datum: selDatum,
      misto_prace: mistoPrace,
      napln_prace: naplnPrace.trim(),
      duvod_zpozdeni: isLate ? duvodZpozdeni.trim() : null,
      rows: payload,
    })
    setPending(false)

    if ("error" in result) {
      setError(result.error)
      toast.error(result.error)
    } else {
      toast.success(`Zapsáno ${result.count} záznam${result.count === 1 ? "" : result.count < 5 ? "y" : "ů"} (${formatMinutes(totalMinut)})`)
      setOpen(false)
      onSuccess?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Zapsat hodiny
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Zapsat odpracované hodiny</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Datum + Odkud */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ph-datum">Datum *</Label>
              <Input
                id="ph-datum"
                type="date"
                value={selDatum}
                onChange={(e) => setSelDatum(e.target.value)}
                max={today}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ph-misto">Odkud jsi pracovala *</Label>
              <select
                id="ph-misto"
                value={mistoPrace}
                onChange={(e) => setMistoPrace(e.target.value as MistoPrace)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="kancelar">Kancelář</option>
                <option value="remote">Remote (z domu)</option>
                <option value="akce">Na akci</option>
              </select>
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-3">
            <Label>Záznamy (zakázka + trvání) *</Label>
            {rows.map((r, idx) => (
              <RowEditor
                key={r.key}
                row={r}
                aktivniNabidky={aktivniNabidky}
                onChange={(patch) => updateRow(r.key, patch)}
                onRemove={rows.length > 1 ? () => removeRow(r.key) : null}
                isLast={idx === rows.length - 1}
              />
            ))}
            {filledRows.length > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                Celkem: <span className="font-medium text-foreground">{formatMinutes(totalMinut)}</span>
                {" "}({filledRows.length} {filledRows.length === 1 ? "záznam" : filledRows.length < 5 ? "záznamy" : "záznamů"})
              </p>
            )}
          </div>

          {/* Náplň práce (sdílená) */}
          <div className="space-y-2">
            <Label htmlFor="ph-napln">Náplň práce *</Label>
            <Textarea
              id="ph-napln"
              value={naplnPrace}
              onChange={(e) => setNaplnPrace(e.target.value)}
              placeholder="Popiš co jsi dělala — platí pro všechny záznamy výše"
              rows={3}
              required
            />
            <p className="text-xs text-muted-foreground">
              Jeden popis pro všechny záznamy (volání uchazečům, příprava DPP, briefing…).
            </p>
          </div>

          {/* Zpětný zápis */}
          {isLate && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-yellow-600 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Zpětný zápis — tento den je starší než 1 den ({diffDays} dní)
              </div>
              <div className="space-y-2">
                <Label htmlFor="ph-duvod">
                  Důvod zpoždění {duvodRequired ? "*" : "(volitelný)"}
                </Label>
                <Textarea
                  id="ph-duvod"
                  value={duvodZpozdeni}
                  onChange={(e) => setDuvodZpozdeni(e.target.value)}
                  placeholder="Proč zápis neproběhl včas…"
                  rows={2}
                  required={duvodRequired}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button type="submit" disabled={pending || filledRows.length === 0}>
              {pending ? "Ukládám…" : `Zapsat${filledRows.length > 0 ? ` (${filledRows.length})` : ""}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RowEditor({
  row,
  aktivniNabidky,
  onChange,
  onRemove,
  isLast,
}: {
  row: RowState
  aktivniNabidky: AktivniNabidkaPickerItem[]
  onChange: (patch: Partial<RowState>) => void
  onRemove: (() => void) | null
  isLast: boolean
}) {
  const filteredNabidky = useMemo(() => {
    const q = row.nabidka_query.trim().toLowerCase()
    if (!q) return aktivniNabidky.slice(0, 30)
    return aktivniNabidky.filter(n => n.nazev.toLowerCase().includes(q)).slice(0, 30)
  }, [row.nabidka_query, aktivniNabidky])

  const selectedNabidka = aktivniNabidky.find(n => n.id === row.nabidka_id) ?? null
  const parsedMinut = row.trvani.trim() ? parseMinutes(row.trvani) : null

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${isLast ? "border-dashed" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onChange({ typ: "nabidka" })}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${row.typ === "nabidka" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
          >
            Zakázka
          </button>
          <button
            type="button"
            onClick={() => onChange({ typ: "ostatni", nabidka_id: "", nabidka_query: "" })}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${row.typ === "ostatni" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
          >
            Ostatní
          </button>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="h-7 w-7 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
            aria-label="Odebrat řádek"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-start">
        <div>
          {row.typ === "nabidka" ? (
            selectedNabidka ? (
              <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2">
                <span className="text-sm font-medium truncate">{selectedNabidka.nazev}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ nabidka_id: "", nabidka_query: "" })}
                >
                  Změnit
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Input
                  placeholder="Hledat zakázku…"
                  value={row.nabidka_query}
                  onChange={(e) => onChange({ nabidka_query: e.target.value })}
                  autoComplete="off"
                />
                {filteredNabidky.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border bg-background">
                    {filteredNabidky.map(n => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => onChange({ nabidka_id: n.id, nabidka_query: n.nazev })}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                      >
                        {n.nazev}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Ostatní (bez zakázky)
            </div>
          )}
        </div>
        <div className="sm:w-32">
          <Input
            placeholder="např. 1:30"
            value={row.trvani}
            onChange={(e) => onChange({ trvani: e.target.value })}
            aria-label="Trvání"
          />
          {row.trvani.trim() && (
            parsedMinut !== null && parsedMinut > 0 ? (
              <p className="text-xs text-green-600 mt-1">→ {formatMinutes(parsedMinut)}</p>
            ) : (
              <p className="text-xs text-destructive mt-1">Neplatný formát</p>
            )
          )}
        </div>
      </div>
    </div>
  )
}
