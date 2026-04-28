"use client"

import { useTransition, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileText, Mail, Upload } from "lucide-react"
import { generateDpp, generateProhlaseni, sendDppEmail, uploadPodpis } from "@/lib/actions/dokumenty"
import { toast } from "sonner"
import { isTestMode } from "@/lib/utils/test-mode"

// F-0023: V test režimu zobrazujeme disabled tlačítko s hláškou,
// aby náborářka věděla, že feature existuje, ale není teď aktivní.
const TEST_MODE_LABEL = "Test režim"
const TEST_MODE_TOOLTIP = "V test režimu nedostupné. Aktivuje se po přechodu do plné verze."

function TestModeDisabledButton({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      disabled
      title={TEST_MODE_TOOLTIP}
      className="cursor-not-allowed opacity-60"
    >
      <Icon className="h-4 w-4 mr-1" />
      {label} ({TEST_MODE_LABEL})
    </Button>
  )
}

export function GenerateDppButton({ brigadnikId, rok }: { brigadnikId: string; rok: number }) {
  const [isPending, startTransition] = useTransition()
  if (isTestMode()) {
    return <TestModeDisabledButton icon={FileText} label={`Vygenerovat DPP ${rok}`} />
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await generateDpp(brigadnikId, rok)
          if (result.error) toast.error(result.error)
          else toast.success("DPP vygenerováno!")
        })
      }}
    >
      <FileText className="h-4 w-4 mr-1" />
      {isPending ? "Generuji..." : `Vygenerovat DPP ${rok}`}
    </Button>
  )
}

export function GenerateProhlaseniButton({ brigadnikId, rok }: { brigadnikId: string; rok: number }) {
  const [isPending, startTransition] = useTransition()
  if (isTestMode()) {
    return <TestModeDisabledButton icon={FileText} label={`Vygenerovat prohlášení ${rok}`} />
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await generateProhlaseni(brigadnikId, rok)
          if (result.error) toast.error(result.error)
          else toast.success("Prohlášení vygenerováno!")
        })
      }}
    >
      <FileText className="h-4 w-4 mr-1" />
      {isPending ? "Generuji..." : `Vygenerovat prohlášení ${rok}`}
    </Button>
  )
}

export function SendDppButton({ brigadnikId, rok }: { brigadnikId: string; rok: number }) {
  const [isPending, startTransition] = useTransition()
  if (isTestMode()) {
    return <TestModeDisabledButton icon={Mail} label={`Odeslat DPP ${rok}`} />
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await sendDppEmail(brigadnikId, rok)
          if (result.error) toast.error(result.error)
          else toast.success("DPP odeslána emailem!")
        })
      }}
    >
      <Mail className="h-4 w-4 mr-1" />
      {isPending ? "Odesílám..." : `Odeslat DPP ${rok}`}
    </Button>
  )
}

export function UploadPodpisForm({
  brigadnikId,
  rok,
  typ,
  label,
}: {
  brigadnikId: string
  rok: number
  typ: "dpp_podpis" | "prohlaseni_podpis"
  label: string
}) {
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action={(formData) => {
        startTransition(async () => {
          const result = await uploadPodpis(formData)
          if (result.error) toast.error(result.error)
          else {
            toast.success(`${label} nahrán!`)
            formRef.current?.reset()
          }
        })
      }}
      className="flex items-end gap-2"
    >
      <input type="hidden" name="brigadnik_id" value={brigadnikId} />
      <input type="hidden" name="rok" value={rok} />
      <input type="hidden" name="typ" value={typ} />
      <div className="space-y-1 flex-1">
        <Label className="text-xs">{label}</Label>
        <Input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required className="h-9 text-xs" />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        <Upload className="h-4 w-4 mr-1" />
        {isPending ? "..." : "Nahrát"}
      </Button>
    </form>
  )
}
