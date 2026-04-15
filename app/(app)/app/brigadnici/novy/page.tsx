"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { createBrigadnik } from "@/lib/actions/brigadnici"

export default function NovyBrigadnikPage() {
  const router = useRouter()

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await createBrigadnik(formData)
      if (result.success) {
        router.push("/app/brigadnici")
        return null
      }
      return result
    },
    null
  )

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Nový brigádník</h1>

      <Card>
        <CardHeader>
          <CardTitle>Základní údaje</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jmeno">Jméno *</Label>
                <Input id="jmeno" name="jmeno" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prijmeni">Příjmení *</Label>
                <Input id="prijmeni" name="prijmeni" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefon">Telefon *</Label>
                <Input id="telefon" name="telefon" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="poznamky">Poznámky</Label>
              <Textarea id="poznamky" name="poznamky" rows={3} />
            </div>

            <input type="hidden" name="zdroj" value="rucne" />

            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Ukládám..." : "Přidat brigádníka"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Zrušit
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
