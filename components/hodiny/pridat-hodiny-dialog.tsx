"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, AlertTriangle } from "lucide-react"
import { addHodiny, type AktivniNabidkaPickerItem, type TypZaznamu, type MistoPrace } from "@/lib/actions/naborar-hodiny"
import { parseMinutes, formatMinutes } from "@/lib/utils/minutes"
import { toast } from "sonner"

interface Props {
  datum?: string
  aktivniNabidky: AktivniNabidkaPickerItem[]
  onSuccess?: () => void
  trigger?: React.ReactNode
  defaultOpen?: boolean
}

/**
 * F-0019 — Dialog pro přidání záznamu hodin.
 * - typ_zaznamu toggle (Zakázka | Ostatní)
 * - nabídka searchable picker (input s filtered native list)
 * - flexibilní trvání (parseMinutes) s live preview
 * - misto_prace + napln_prace
 * - automatická detekce zpětného zápisu (>1 den → duvod povinný)
 */
export function PridatHodinyDialog({ datum, aktivniNabidky, onSuccess, trigger, defaultOpen = false }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [open, setOpen] = useState(defaultOpen)

  const [selDatum, setSelDatum] = useState(datum ?? today)
  const [typZaznamu, setTypZaznamu] = useState<TypZaznamu>("ostatni")
  const [nabidkaQuery, setNabidkaQuery] = useState("")
  const [nabidkaId, setNabidkaId] = useState<string>("")
  const [trvaniText, setTrvaniText] = useState("")
  const [mistoPrace, setMistoPrace] = useState<MistoPrace>("kancelar")
  const [naplnPrace, setNaplnPrace] = useState("")
  const [duvodZpozdeni, setDuvodZpozdeni] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const parsedMinut = useMemo(() => (trvaniText.trim() ? parseMinutes(trvaniText) : null), [trvaniText])
  const diffDays = useMemo(() => {
    const d = new Date(selDatum); const n = new Date()
    d.setHours(0, 0, 0, 0); n.setHours(0, 0, 0, 0)
    return Math.floor((n.getTime() - d.getTime()) / 86400000)
  }, [selDatum])
  const isLate = diffDays > 1
  const duvodRequired = diffDays > 7

  const filteredNabidky = useMemo(() => {
    const q = nabidkaQuery.trim().toLowerCase()
    if (!q) return aktivniNabidky.slice(0, 50)
    return aktivniNabidky.filter((n) => n.nazev.toLowerCase().includes(q)).slice(0, 50)
  }, [nabidkaQuery, aktivniNabidky])

  const selectedNabidka = aktivniNabidky.find((n) => n.id === nabidkaId) ?? null

  useEffect(() => {
    if (!open) {
      // Reset on close
      setTypZaznamu("ostatni")
      setNabidkaQuery("")
      setNabidkaId("")
      setTrvaniText("")
      setMistoPrace("kancelar")
      setNaplnPrace("")
      setDuvodZpozdeni("")
      setError("")
      setSelDatum(datum ?? today)
    }
  }, [open, datum, today])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (parsedMinut === null) {
      setError('Zadej platné trvání (např. „1:30", „90m", „1h 30m")')
      return
    }
    if (typZaznamu === "nabidka" && !nabidkaId) {
      setError("Vyber zakázku")
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

    setPending(true)
    const result = await addHodiny({
      datum: selDatum,
      trvani_minut: parsedMinut,
      misto_prace: mistoPrace,
      napln_prace: naplnPrace.trim(),
      typ_zaznamu: typZaznamu,
      nabidka_id: typZaznamu === "nabidka" ? nabidkaId : null,
      duvod_zpozdeni: isLate ? duvodZpozdeni.trim() : null,
    })
    setPending(false)

    if ("error" in result) {
      setError(result.error)
      toast.error(result.error)
    } else {
      toast.success("Hodiny zapsány")
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zapsat odpracované hodiny</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Typ záznamu toggle */}
          <div className="space-y-2">
            <Label>Typ záznamu *</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={typZaznamu === "nabidka" ? "default" : "outline"}
                onClick={() => setTypZaznamu("nabidka")}
                className="h-12"
              >
                Zakázka
              </Button>
              <Button
                type="button"
                variant={typZaznamu === "ostatni" ? "default" : "outline"}
                onClick={() => {
                  setTypZaznamu("ostatni")
                  setNabidkaId("")
                  setNabidkaQuery("")
                }}
                className="h-12"
              >
                Ostatní
              </Button>
            </div>
          </div>

          {/* Nabídka picker */}
          {typZaznamu === "nabidka" && (
            <div className="space-y-2">
              <Label htmlFor="ph-nabidka">Zakázka *</Label>
              {selectedNabidka ? (
                <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2">
                  <span className="text-sm font-medium">{selectedNabidka.nazev}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setNabidkaId(""); setNabidkaQuery("") }}>
                    Změnit
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    id="ph-nabidka"
                    placeholder="Hledat zakázku…"
                    value={nabidkaQuery}
                    onChange={(e) => setNabidkaQuery(e.target.value)}
                    autoComplete="off"
                  />
                  {filteredNabidky.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Žádná aktivní zakázka nenalezena</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
                      {filteredNabidky.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => { setNabidkaId(n.id); setNabidkaQuery(n.nazev) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        >
                          {n.nazev}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Datum + Trvání */}
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
              <Label htmlFor="ph-trvani">Trvání *</Label>
              <Input
                id="ph-trvani"
                placeholder="např. 1:30, 90m, 1h 30m"
                value={trvaniText}
                onChange={(e) => setTrvaniText(e.target.value)}
                required
              />
              {trvaniText.trim() && (
                parsedMinut !== null ? (
                  <p className="text-xs text-green-600">→ {formatMinutes(parsedMinut)}</p>
                ) : (
                  <p className="text-xs text-destructive">Neplatný formát (max 24h)</p>
                )
              )}
            </div>
          </div>

          {/* Misto prace */}
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

          {/* Napln prace */}
          <div className="space-y-2">
            <Label htmlFor="ph-napln">Náplň práce *</Label>
            <Textarea
              id="ph-napln"
              value={naplnPrace}
              onChange={(e) => setNaplnPrace(e.target.value)}
              placeholder="Popiš co jsi dělala — volání uchazečům, příprava DPP…"
              rows={3}
              required
            />
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
            <Button type="submit" disabled={pending}>
              {pending ? "Ukládám…" : "Zapsat"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
