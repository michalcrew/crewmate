"use client"

import { useActionState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { submitPrihlaska } from "@/lib/actions/prihlaska"
import { CheckCircle, Upload } from "lucide-react"

export function PrihlaskaForm({ nabidkaId }: { nabidkaId: string }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      formData.set("nabidka_id", nabidkaId)
      return await submitPrihlaska(formData)
    },
    null
  )

  if (state?.success) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Přihláška odeslána!</h3>
          <p className="text-muted-foreground">
            Děkujeme za přihlášku. Ozveme se vám co nejdříve.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="jmeno">Jméno *</Label>
              <Input id="jmeno" name="jmeno" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prijmeni">Příjmení *</Label>
              <Input id="prijmeni" name="prijmeni" required />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefon">Telefon *</Label>
              <Input id="telefon" name="telefon" required />
            </div>
          </div>

          {/* File uploads */}
          <div className="space-y-2">
            <Label htmlFor="cv" className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Životopis (CV)
            </Label>
            <Input
              id="cv"
              name="cv"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-sm file:font-medium hover:file:bg-gray-200 cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">PDF nebo DOC/DOCX, max 20 MB</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="foto" className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Fotka
            </Label>
            <Input
              id="foto"
              name="foto"
              type="file"
              accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif"
              className="file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-sm file:font-medium hover:file:bg-gray-200 cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">JPG, PNG nebo HEIC, max 20 MB</p>
          </div>

          <div className="flex items-start gap-2 pt-2">
            <input
              type="checkbox"
              id="gdpr"
              name="gdpr"
              required
              className="h-4 w-4 mt-0.5 rounded border-input"
            />
            <Label htmlFor="gdpr" className="font-normal text-sm text-muted-foreground">
              Souhlasím se zpracováním osobních údajů za účelem náboru. Údaje budou uchovány po dobu náboru a max. 3 roky dle zákonné povinnosti. *
            </Label>
          </div>

          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Odesílám..." : "Odeslat přihlášku"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
