"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateUserPodpis } from "@/lib/actions/users"
import { toast } from "sonner"

type Props = {
  defaultPodpis: string
  fallback: string
}

/**
 * F-0013 US-1E-1 — textarea pro úpravu vlastního podpisu (`users.podpis`).
 *
 * Server Action {@link updateUserPodpis} sanitizuje přes allowlist `sanitize-html`
 * (povolené tagy: <b>, <i>, <u>, <br>, <p>, <span>, <a href>, <strong>, <em>).
 * Self-only (RLS check v Server Action).
 */
export function PodpisForm({ defaultPodpis, fallback }: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      const podpis = String(formData.get("podpis") ?? "")
      const result = await updateUserPodpis(podpis)
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
