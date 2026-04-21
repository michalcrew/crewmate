"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus } from "lucide-react"
import { addHodnoceni } from "@/lib/actions/hodnoceni"
import { StarRating } from "@/components/ui/star-rating"
import { toast } from "sonner"

type AkceOpt = { id: string; nazev: string; datum: string }

type Props = {
  brigadnikId: string
  akceOptions: AkceOpt[]
}

/**
 * F-0016 US-1C-1 — Přidat hodnocení.
 *
 * Akce výběr volitelný. Loader předá posledních 50 akcí z posledních 6 měsíců
 * (per Architect open item #3).
 */
export function PridatHodnoceniDialog({ brigadnikId, akceOptions }: Props) {
  const [open, setOpen] = useState(false)
  const [hodnoceni, setHodnoceni] = useState<number>(5)
  const [poznamka, setPoznamka] = useState("")
  const [akceId, setAkceId] = useState<string>("")
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setHodnoceni(5)
    setPoznamka("")
    setAkceId("")
    setErr(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    startTransition(async () => {
      const res = await addHodnoceni(
        brigadnikId,
        hodnoceni,
        poznamka.trim() || null,
        akceId || null
      )
      if ("success" in res && res.success) {
        toast.success("Hodnocení uloženo")
        setOpen(false)
        reset()
      } else if ("error" in res) {
        setErr(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Přidat hodnocení
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Přidat hodnocení</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Hodnocení</Label>
            <div>
              <StarRating value={hodnoceni} onChange={setHodnoceni} size="md" showCount={false} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ph-poznamka">Poznámka (volitelné)</Label>
            <Textarea
              id="ph-poznamka"
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
              placeholder="Spolehlivý, dobře komunikuje…"
            />
            <p className="text-[10px] text-muted-foreground text-right">
              {poznamka.length}/500
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ph-akce">Akce (volitelné)</Label>
            <select
              id="ph-akce"
              value={akceId}
              onChange={(e) => setAkceId(e.target.value)}
              className="w-full border rounded-md h-9 px-2 text-sm bg-background"
            >
              <option value="">— Bez akce —</option>
              {akceOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.datum).toLocaleDateString("cs-CZ")} — {a.nazev}
                </option>
              ))}
            </select>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button type="submit" disabled={pending}>{pending ? "Ukládám…" : "Uložit"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
