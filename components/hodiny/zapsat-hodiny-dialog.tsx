"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, AlertTriangle } from "lucide-react"
import { zapsatHodiny } from "@/lib/actions/naborar-hodiny"
import { toast } from "sonner"

export function ZapsatHodinyDialog() {
  const [open, setOpen] = useState(false)
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10))
  const [isLate, setIsLate] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const entryDate = new Date(datum)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
    setIsLate(diffDays > 1)
  }, [datum])

  async function handleSubmit(formData: FormData) {
    setPending(true)
    setError("")
    const result = await zapsatHodiny(formData)
    setPending(false)
    if (result.error) {
      setError(result.error)
      toast.error(result.error)
    } else {
      toast.success("Hodiny zapsány")
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Zapsat hodiny
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zapsat odpracované hodiny</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zh-datum">Datum *</Label>
              <Input
                id="zh-datum"
                name="datum"
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zh-hodin">Počet hodin *</Label>
              <Input
                id="zh-hodin"
                name="hodin"
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                placeholder="např. 8"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="zh-misto">Odkud pracuji *</Label>
            <select id="zh-misto" name="misto_prace" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="kancelar">Kancelář</option>
              <option value="remote">Remote (z domu)</option>
              <option value="akce">Na akci</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="zh-napln">Náplň práce *</Label>
            <Textarea
              id="zh-napln"
              name="napln_prace"
              placeholder="Popište co jste dělali — volání uchazečům, odesílání dotazníků, příprava DPP..."
              rows={3}
              required
            />
          </div>

          {isLate && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-yellow-600 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Zpětný zápis — tento den je starší než 1 den
              </div>
              <div className="space-y-2">
                <Label htmlFor="zh-duvod">Důvod zpoždění *</Label>
                <Textarea
                  id="zh-duvod"
                  name="duvod_zpozdeni"
                  placeholder="Proč zápis neproběhl včas..."
                  rows={2}
                  required
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukládám..." : isLate ? "Požádat o zpětný zápis" : "Zapsat hodiny"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
