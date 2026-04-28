"use client"

import { useActionState, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pencil } from "lucide-react"
import { updateAkce } from "@/lib/actions/akce"
import { toast } from "sonner"

type Props = {
  akceId: string
  akceStav: "planovana" | "probehla" | "zrusena"
  defaultCasOd: string | null
  defaultCasDo: string | null
  defaultPocetLidi: number | null
  /** Přenesená pole pro úplný update (schema vyžaduje nazev, datum, misto). */
  nazev: string
  datum: string
  misto: string | null
}

/**
 * Rychlý edit akce — čas začátku, čas konce, počet lidí.
 *
 * Pravidla dle server updateAkce:
 *  - planovana: všechna 3 pole editovatelná
 *  - probehla: jen pocet_lidi (čas je zamčený, akce už proběhla)
 *  - zrusena: tlačítko se nerenderuje (parent page to zajišťuje)
 */
export function EditAkceDialog({
  akceId,
  akceStav,
  defaultCasOd,
  defaultCasDo,
  defaultPocetLidi,
  nazev,
  datum,
  misto,
}: Props) {
  const [open, setOpen] = useState(false)
  const isProbehla = akceStav === "probehla"

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      // Server updateAkce používá updateAkceFullSchema pro planovana —
      // potřebuje nazev/datum/misto i když neměníme. Přimažeme je.
      formData.set("nazev", nazev)
      formData.set("datum", datum)
      if (misto) formData.set("misto", misto)
      const result = await updateAkce(akceId, formData)
      if ("error" in result) return { error: result.error }
      toast.success("Akce upravena")
      setOpen(false)
      return null
    },
    null,
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Upravit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upravit akci</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ea-cas-od">Čas od</Label>
              <Input
                id="ea-cas-od"
                name="cas_od"
                type="time"
                defaultValue={defaultCasOd?.slice(0, 5) ?? ""}
                disabled={isProbehla}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ea-cas-do">Čas do</Label>
              <Input
                id="ea-cas-do"
                name="cas_do"
                type="time"
                defaultValue={defaultCasDo?.slice(0, 5) ?? ""}
                disabled={isProbehla}
              />
            </div>
          </div>
          {isProbehla && (
            <p className="text-xs text-muted-foreground">
              Akce už proběhla — čas editovat nelze, jen počet lidí.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="ea-pocet">Počet lidí</Label>
            <Input
              id="ea-pocet"
              name="pocet_lidi"
              type="number"
              min={1}
              defaultValue={defaultPocetLidi ?? ""}
              placeholder="např. 10"
            />
          </div>
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Zrušit
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Ukládám…" : "Uložit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
