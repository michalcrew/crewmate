"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { CheckCircle } from "lucide-react"
import { submitKontakt } from "@/lib/actions/kontakt"

export function KontaktForm() {
  const [state, setState] = useState<{ error?: string; success?: boolean } | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(formData: FormData) {
    setPending(true)
    setState(null)
    const result = await submitKontakt(formData)
    setState(result)
    setPending(false)
  }

  if (state?.success) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm text-center">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold mb-2">Poptávka odeslána!</h3>
        <p className="text-gray-500">Ozveme se vám do 24 hodin.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
      <h3 className="text-lg font-bold mb-2">Nezávazná poptávka</h3>
      <p className="text-sm text-gray-500 mb-6">Vyplňte formulář a ozveme se do 24 hodin.</p>
      <form action={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="c-jmeno">Jméno a příjmení *</Label>
            <Input id="c-jmeno" name="jmeno" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-firma">Firma / organizace</Label>
            <Input id="c-firma" name="firma" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="c-email">Email *</Label>
            <Input id="c-email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-telefon">Telefon *</Label>
            <Input id="c-telefon" name="telefon" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-zprava">S čím Vám můžeme pomoci? *</Label>
          <Textarea id="c-zprava" name="zprava" rows={4} required />
        </div>
        <div className="flex items-start gap-2">
          <input type="checkbox" id="c-gdpr" name="gdpr" required className="h-4 w-4 mt-0.5 rounded" />
          <Label htmlFor="c-gdpr" className="font-normal text-xs text-gray-500">
            Souhlasím se zpracováním osobních údajů za účelem zodpovězení mé poptávky.
          </Label>
        </div>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" size="lg" className="w-full bg-[#1a1a4e] hover:bg-[#2a2a6e] text-white rounded-full" disabled={pending}>
          {pending ? "Odesílám..." : "Odeslat poptávku"}
        </Button>
      </form>
    </div>
  )
}
