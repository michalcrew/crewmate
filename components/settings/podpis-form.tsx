"use client"

import { useActionState, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateUserPodpis } from "@/lib/actions/users"
import { toast } from "sonner"

type Props = {
  defaultPodpis: string
  defaultPridatLogo?: boolean
  fallback: string
}

/**
 * F-0013 US-1E-1 — textarea pro úpravu vlastního podpisu (`users.podpis`).
 * HF4 — přidán checkbox „Přidat logo Crewmate nad podpis" (`users.pridat_logo`).
 *
 * Server Action {@link updateUserPodpis} sanitizuje přes allowlist `sanitize-html`
 * (povolené tagy: <b>, <i>, <u>, <br>, <p>, <span>, <a href>, <strong>, <em>,
 * + <img> se src whitelistem pro Crewmate logo). Self-only (RLS check v Server Action).
 */
export function PodpisForm({
  defaultPodpis,
  defaultPridatLogo = false,
  fallback,
}: Props) {
  const [pridatLogo, setPridatLogo] = useState<boolean>(defaultPridatLogo)

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      const podpis = String(formData.get("podpis") ?? "")
      const logo = formData.get("pridat_logo") === "on"
      const result = await updateUserPodpis(podpis, logo)
      if ("error" in result) {
        toast.error(result.error)
        return { error: result.error }
      }
      if (result.stripped && result.stripped > 0) {
        toast.success(
          `Podpis uložen (odstraněno ${result.stripped} znaků neplatného HTML).`
        )
      } else {
        toast.success("Podpis uložen.")
      }
      return { success: true }
    },
    null
  )

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="podpis">Můj podpis</Label>
        <Textarea
          id="podpis"
          name="podpis"
          defaultValue={defaultPodpis}
          placeholder={fallback}
          rows={6}
          maxLength={1000}
          className="font-mono text-sm"
          aria-invalid={state?.error ? true : undefined}
        />
        <p className="text-xs text-muted-foreground">
          Povolené HTML tagy: <code>&lt;br&gt;</code>, <code>&lt;strong&gt;</code>,
          {" "}<code>&lt;em&gt;</code>, <code>&lt;a href&gt;</code>. Skripty a styly
          jsou automaticky odstraněny. Max. 1000 znaků.
        </p>
      </div>

      <div className="flex items-start gap-2 pt-2">
        <input
          type="checkbox"
          id="pridat_logo"
          name="pridat_logo"
          checked={pridatLogo}
          onChange={(e) => setPridatLogo(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-input"
        />
        <div>
          <Label htmlFor="pridat_logo" className="cursor-pointer font-normal">
            Přidat logo Crewmate nad podpis
          </Label>
          <p className="text-xs text-muted-foreground">
            Logo se vloží do každého odchozího emailu jako obrázek nad podpisem
            (velikost ~40px, bílé pozadí).
          </p>
        </div>
      </div>

      {state?.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Ukládám..." : "Uložit podpis"}
        </Button>
      </div>
    </form>
  )
}
