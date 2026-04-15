"use client"

import { useTransition, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileText, Mail, Upload } from "lucide-react"
import { generateDpp, generateProhlaseni, sendDppEmail, uploadPodpis } from "@/lib/actions/dokumenty"
import { toast } from "sonner"

export function GenerateDppButton({ brigadnikId, mesic }: { brigadnikId: string; mesic: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await generateDpp(brigadnikId, mesic)
          if (result.error) toast.error(result.error)
          else toast.success("DPP vygenerováno!")
        })
      }}
    >
      <FileText className="h-4 w-4 mr-1" />
      {isPending ? "Generuji..." : "Vygenerovat DPP"}
    </Button>
  )
}

export function GenerateProhlaseniButton({ brigadnikId, mesic }: { brigadnikId: string; mesic: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await generateProhlaseni(brigadnikId, mesic)
          if (result.error) toast.error(result.error)
          else toast.success("Prohlášení vygenerováno!")
        })
      }}
    >
      <FileText className="h-4 w-4 mr-1" />
      {isPending ? "Generuji..." : "Vygenerovat prohlášení"}
    </Button>
  )
}

export function SendDppButton({ brigadnikId, mesic }: { brigadnikId: string; mesic: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await sendDppEmail(brigadnikId, mesic)
          if (result.error) toast.error(result.error)
          else toast.success("DPP odeslána emailem!")
        })
      }}
    >
      <Mail className="h-4 w-4 mr-1" />
      {isPending ? "Odesílám..." : "Odeslat DPP"}
    </Button>
  )
}

export function UploadPodpisForm({
  brigadnikId,
  mesic,
  typ,
  label,
}: {
  brigadnikId: string
  mesic: string
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
      <input type="hidden" name="mesic" value={mesic} />
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
