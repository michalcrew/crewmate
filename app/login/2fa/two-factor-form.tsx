"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { verify2FA, requestNew2FACode } from "@/lib/actions/two-factor"

export function TwoFactorForm() {
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [pending, setPending] = useState(false)
  const [resending, setResending] = useState(false)

  async function handleSubmit(formData: FormData) {
    setPending(true)
    setError("")
    setInfo("")
    const result = await verify2FA(formData)
    if (result?.error) {
      setError(result.error)
    }
    setPending(false)
  }

  async function handleResend() {
    setResending(true)
    setError("")
    setInfo("")
    const result = await requestNew2FACode()
    if (result.ok) {
      setInfo("Nový kód byl odeslán na váš e-mail.")
    } else {
      setError(result.error ?? "Nepodařilo se odeslat nový kód.")
    }
    setResending(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#000066]">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <img src="/images/logo/crewmate-logo.svg" alt="Crewmate" className="h-8 mx-auto mb-2" />
          <CardTitle className="text-2xl font-bold sr-only">Crewmate</CardTitle>
          <CardDescription>
            Zadejte 6místný ověřovací kód, který jsme vám poslali e-mailem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Kód z e-mailu</Label>
              <Input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="000000"
                required
                className="text-center text-2xl tracking-widest font-mono"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                name="trustDevice"
                className="rounded border-input"
              />
              Důvěřovat tomuto zařízení 90 dní
            </label>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            {info && (
              <p className="text-sm text-emerald-600">{info}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Ověřuji..." : "Ověřit a přihlásit"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || pending}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              {resending ? "Odesílám..." : "Nepřišel kód? Poslat znovu"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
