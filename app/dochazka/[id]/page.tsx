"use client"

import { useState, useActionState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { verifyPin, getDochazkaByAkce, saveDochazka } from "@/lib/actions/dochazka"
import { use } from "react"

type AkceInfo = { id: string; nazev: string; datum: string; cas_od: string | null; cas_do: string | null; misto: string | null }
type DochazkaEntry = {
  id: string
  brigadnik: { id: string; jmeno: string; prijmeni: string } | null
  pozice: string | null
  dochazka: { id: string; prichod: string | null; odchod: string | null; hodin_celkem: number | null; hodnoceni: number | null; poznamka: string | null }[]
}

export default function DochazkaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: akceId } = use(params)
  const [akce, setAkce] = useState<AkceInfo | null>(null)
  const [entries, setEntries] = useState<DochazkaEntry[]>([])
  const [pinError, setPinError] = useState("")
  const [saving, setSaving] = useState<string | null>(null)

  const handlePinSubmit = async (formData: FormData) => {
    const pin = formData.get("pin") as string
    const result = await verifyPin(akceId, pin)
    if (result.error) {
      setPinError(result.error)
      return
    }
    if (result.akce) {
      setAkce(result.akce)
      const data = await getDochazkaByAkce(akceId)
      setEntries(data as unknown as DochazkaEntry[])
    }
  }

  const handleSaveRow = async (formData: FormData) => {
    const prirazeniId = formData.get("prirazeni_id") as string
    setSaving(prirazeniId)
    await saveDochazka(formData)
    const data = await getDochazkaByAkce(akceId)
    setEntries(data as unknown as DochazkaEntry[])
    setSaving(null)
  }

  // PIN screen
  if (!akce) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>Docházka</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handlePinSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">PIN kód</Label>
                <Input
                  id="pin"
                  name="pin"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="6-místný PIN"
                  className="text-center text-2xl tracking-widest h-14"
                  required
                  autoFocus
                />
              </div>
              {pinError && <p className="text-sm text-destructive text-center">{pinError}</p>}
              <Button type="submit" className="w-full" size="lg">Ověřit PIN</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Attendance table
  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{akce.nazev}</h1>
        <p className="text-muted-foreground">
          {new Date(akce.datum).toLocaleDateString("cs-CZ")}
          {akce.cas_od && ` | ${akce.cas_od.slice(0, 5)}`}
          {akce.cas_do && ` — ${akce.cas_do.slice(0, 5)}`}
          {akce.misto && ` | ${akce.misto}`}
        </p>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Na tuto akci nejsou přiřazení žádní brigádníci.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => {
            const b = entry.brigadnik
            const d = entry.dochazka?.[0]
            if (!b) return null
            return (
              <Card key={entry.id} className={saving === entry.id ? "opacity-50" : ""}>
                <CardContent className="pt-4">
                  <form action={handleSaveRow}>
                    <input type="hidden" name="prirazeni_id" value={entry.id} />
                    <input type="hidden" name="akce_id" value={akceId} />
                    <input type="hidden" name="brigadnik_id" value={b.id} />

                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold">{b.prijmeni} {b.jmeno}</p>
                        {entry.pozice && <p className="text-sm text-muted-foreground">{entry.pozice}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Příchod</Label>
                        <Input name="prichod" type="time" defaultValue={d?.prichod?.slice(0, 5) ?? ""} className="h-12 text-lg" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Odchod</Label>
                        <Input name="odchod" type="time" defaultValue={d?.odchod?.slice(0, 5) ?? ""} className="h-12 text-lg" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Hodnocení (1-5)</Label>
                        <Input name="hodnoceni" type="number" min="1" max="5" defaultValue={d?.hodnoceni ?? ""} className="h-12 text-lg" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Poznámka</Label>
                        <Input name="poznamka" defaultValue={d?.poznamka ?? ""} className="h-12" />
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <Button type="submit" size="sm">Uložit</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
