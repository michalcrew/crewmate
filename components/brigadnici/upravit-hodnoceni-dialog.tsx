"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Pencil } from "lucide-react"
import { updateHodnoceni } from "@/lib/actions/hodnoceni"
import { StarRating } from "@/components/ui/star-rating"
import { toast } from "sonner"

type AkceOpt = { id: string; nazev: string; datum: string }

type Props = {
  hodnoceniId: string
  initial: {
    hodnoceni: number
    poznamka: string | null
    akce_id: string | null
  }
  akceOptions: AkceOpt[]
}

/**
 * F-0016 US-1C-2 — upravit existing hodnocení (prefilled).
 */
export function UpravitHodnoceniDialog({ hodnoceniId, initial, akceOptions }: Props) {
  const [open, setOpen] = useState(false)
  const [hodnoceni, setHodnoceni] = useState<number>(initial.hodnoceni)
  const [poznamka, setPoznamka] = useState(initial.poznamka ?? "")
  const [akceId, setAkceId] = useState<string>(initial.akce_id ?? "")
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    startTransition(async () => {
      const res = await updateHodnoceni(hodnoceniId, {
        hodnoceni,
        poznamka: poznamka.trim() || null,
        akceId: akceId || null,
      })
      if ("success" in res && res.success) {
        toast.success("Hodnocení uloženo")
        setOpen(false)
      } else if ("error" in res) {
        setErr(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="ghost" size="icon" aria-label="Upravit hodnocení">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upravit hodnocení</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Hodnocení</Label>
            <div>
              <StarRating value={hodnoceni} onChange={setHodnoceni} size="md" showCount={false} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="uh-poznamka">Poznámka</Label>
            <Textarea
              id="uh-poznamka"
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
            />
            <p className="text-[10px] text-muted-foreground text-right">{poznamka.length}/500</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="uh-akce">Akce</Label>
            <select
              id="uh-akce"
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
