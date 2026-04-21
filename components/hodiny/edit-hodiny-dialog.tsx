"use client"

import { useState, useMemo, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Pencil, AlertTriangle } from "lucide-react"
import {
  updateHodiny,
  type AktivniNabidkaPickerItem,
  type HodinyRowWithMeta,
  type TypZaznamu,
  type MistoPrace,
} from "@/lib/actions/naborar-hodiny"
import { parseMinutes, formatMinutes } from "@/lib/utils/minutes"
import { toast } from "sonner"

interface Props {
  hodina: HodinyRowWithMeta
  aktivniNabidky: AktivniNabidkaPickerItem[]
  onSuccess?: () => void
  trigger?: React.ReactNode
  /** F-0019 QA fix: admin edituje cizí záznam — zobraz vizuální warning */
  isAdminCrossEdit?: boolean
  /** Jméno autora záznamu (pro admin cross-edit banner) */
  ownerName?: string
}

/**
 * F-0019 — Dialog pro editaci záznamu hodin.
 * Stejný feature-set jako PridatHodinyDialog, ale prefilled + volá updateHodiny.
 */
export function EditHodinyDialog({ hodina, aktivniNabidky, onSuccess, trigger, isAdminCrossEdit, ownerName }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [open, setOpen] = useState(false)

  const [selDatum, setSelDatum] = useState(hodina.datum)
  const [typZaznamu, setTypZaznamu] = useState<TypZaznamu>(hodina.typ_zaznamu)
  const [nabidkaQuery, setNabidkaQuery] = useState("")
  const [nabidkaId, setNabidkaId] = useState<string>(hodina.nabidka_id ?? "")
  const [trvaniText, setTrvaniText] = useState(String(hodina.trvani_minut))
  const [mistoPrace, setMistoPrace] = useState<MistoPrace>((hodina.misto_prace ?? "kancelar") as MistoPrace)
  const [naplnPrace, setNaplnPrace] = useState(hodina.napln_prace ?? "")
  const [duvodZpozdeni, setDuvodZpozdeni] = useState(hodina.duvod_zpozdeni ?? "")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const parsedMinut = useMemo(() => (trvaniText.trim() ? parseMinutes(trvaniText) : null), [trvaniText])
  const diffDays = useMemo(() => {
    const d = new Date(selDatum); const n = new Date()
    d.setHours(0, 0, 0, 0); n.setHours(0, 0, 0, 0)
    return Math.floor((n.getTime() - d.getTime()) / 86400000)
  }, [selDatum])
  const isLate = diffDays > 1

  const filteredNabidky = useMemo(() => {
    const q = nabidkaQuery.trim().toLowerCase()
    if (!q) return aktivniNabidky.slice(0, 50)
    return aktivniNabidky.filter((n) => n.nazev.toLowerCase().includes(q)).slice(0, 50)
  }, [nabidkaQuery, aktivniNabidky])

  const selectedNabidka = aktivniNabidky.find((n) => n.id === nabidkaId) ?? (hodina.nabidka_id && hodina.nabidka ? { id: hodina.nabidka.id, nazev: hodina.nabidka.nazev } : null)

  useEffect(() => {
    if (!open) {
      // Reset to hodina values on close
      setSelDatum(hodina.datum)
      setTypZaznamu(hodina.typ_zaznamu)
      setNabidkaId(hodina.nabidka_id ?? "")
      setNabidkaQuery("")
      setTrvaniText(String(hodina.trvani_minut))
      setMistoPrace((hodina.misto_prace ?? "kancelar") as MistoPrace)
      setNaplnPrace(hodina.napln_prace ?? "")
      setDuvodZpozdeni(hodina.duvod_zpozdeni ?? "")
      setError("")
    }
  }, [open, hodina])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (parsedMinut === null) {
      setError("Zadej platné trvání")
      return
    }
    if (typZaznamu === "nabidka" && !nabidkaId) {
      setError("Vyber zakázku")
      return
    }

    setPending(true)
    const result = await updateHodiny(hodina.id, {
      datum: selDatum,
      trvani_minut: parsedMinut,
      misto_prace: mistoPrace,
      napln_prace: naplnPrace.trim(),
      typ_zaznamu: typZaznamu,
      nabidka_id: typZaznamu === "nabidka" ? nabidkaId : null,
      duvod_zpozdeni: isLate ? (duvodZpozdeni.trim() || null) : null,
    })
    setPending(false)

    if ("error" in result) {
      setError(result.error)
      toast.error(result.error)
    } else {
      toast.success("Záznam upraven")
      setOpen(false)
      onSuccess?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        {trigger ?? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upravit záznam hodin</DialogTitle>
        </DialogHeader>
        {isAdminCrossEdit && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Upravuješ záznam náborářky {ownerName ?? ""}</p>
              <p className="text-xs opacity-90">Změny se zapíší do auditu (typ: <code>hodiny_admin_correction</code>).</p>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Typ záznamu *</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={typZaznamu === "nabidka" ? "default" : "outline"}
                onClick={() => setTypZaznamu("nabidka")}
                className="h-12"
              >Zakázka</Button>
              <Button
                type="button"
                variant={typZaznamu === "ostatni" ? "default" : "outline"}
                onClick={() => { setTypZaznamu("ostatni"); setNabidkaId(""); setNabidkaQuery("") }}
                className="h-12"
              >Ostatní</Button>
            </div>
          </div>

          {typZaznamu === "nabidka" && (
            <div className="space-y-2">
              <Label htmlFor="eh-nabidka">Zakázka *</Label>
              {selectedNabidka ? (
                <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2">
                  <span className="text-sm font-medium">{selectedNabidka.nazev}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setNabidkaId(""); setNabidkaQuery("") }}>Změnit</Button>
                </div>
              ) : (
                <>
                  <Input id="eh-nabidka" placeholder="Hledat zakázku…" value={nabidkaQuery} onChange={(e) => setNabidkaQuery(e.target.value)} autoComplete="off" />
                  <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
                    {filteredNabidky.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => { setNabidkaId(n.id); setNabidkaQuery(n.nazev) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                      >{n.nazev}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="eh-datum">Datum *</Label>
              <Input id="eh-datum" type="date" value={selDatum} onChange={(e) => setSelDatum(e.target.value)} max={today} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eh-trvani">Trvání *</Label>
              <Input id="eh-trvani" placeholder="např. 1:30, 90m, 1h 30m" value={trvaniText} onChange={(e) => setTrvaniText(e.target.value)} required />
              {trvaniText.trim() && (parsedMinut !== null ? (
                <p className="text-xs text-green-600">→ {formatMinutes(parsedMinut)}</p>
              ) : (
                <p className="text-xs text-destructive">Neplatný formát</p>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eh-misto">Odkud jsi pracovala *</Label>
            <select
              id="eh-misto"
              value={mistoPrace}
              onChange={(e) => setMistoPrace(e.target.value as MistoPrace)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="kancelar">Kancelář</option>
              <option value="remote">Remote (z domu)</option>
              <option value="akce">Na akci</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eh-napln">Náplň práce *</Label>
            <Textarea id="eh-napln" value={naplnPrace} onChange={(e) => setNaplnPrace(e.target.value)} rows={3} required />
          </div>

          {isLate && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-yellow-600 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Zpětný zápis ({diffDays} dní)
              </div>
              <Textarea value={duvodZpozdeni} onChange={(e) => setDuvodZpozdeni(e.target.value)} placeholder="Důvod zpoždění…" rows={2} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button type="submit" disabled={pending}>{pending ? "Ukládám…" : "Uložit"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
