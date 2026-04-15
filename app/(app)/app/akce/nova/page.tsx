"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { createAkce } from "@/lib/actions/akce"

export default function NovaAkcePage() {
  const router = useRouter()

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await createAkce(formData)
      if (result.success) { router.push("/app/akce"); return null }
      return result
    },
    null
  )

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Nová akce</h1>
      <Card>
        <CardHeader><CardTitle>Základní údaje</CardTitle></CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nazev">Název akce *</Label>
              <Input id="nazev" name="nazev" placeholder="např. Sasazu — sobota 19.4." required />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="datum">Datum *</Label>
                <Input id="datum" name="datum" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cas_od">Čas od</Label>
                <Input id="cas_od" name="cas_od" type="time" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cas_do">Čas do</Label>
                <Input id="cas_do" name="cas_do" type="time" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="misto">Místo</Label>
                <Input id="misto" name="misto" placeholder="např. SaSaZu, Praha 7" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="klient">Klient</Label>
                <Input id="klient" name="klient" placeholder="např. SaSaZu Club" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pocet_lidi">Počet lidí</Label>
              <Input id="pocet_lidi" name="pocet_lidi" type="number" min="1" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="poznamky">Poznámky</Label>
              <Textarea id="poznamky" name="poznamky" rows={2} />
            </div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={pending}>{pending ? "Ukládám..." : "Vytvořit akci"}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Zrušit</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
