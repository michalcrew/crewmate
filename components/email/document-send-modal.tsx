"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { sendDocumentAction } from "@/lib/actions/email-documents"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FileText, Send } from "lucide-react"

export function DocumentSendModal({
  brigadnikId,
  brigadnikName,
  documentType,
  missingFields,
}: {
  brigadnikId: string
  brigadnikName: string
  documentType: "dpp" | "prohlaseni"
  missingFields: string[]
}) {
  const [open, setOpen] = useState(false)
  const [mesic, setMesic] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  })
  const [body, setBody] = useState(() => {
    const label = documentType === "dpp" ? "Dohodu o provedení práce (DPP)" : "Prohlášení poplatníka"
    return `Dobrý den,\n\nv příloze Vám zasíláme ${label} k podpisu.\n\nProsím vytiskněte, podepište a pošlete zpět naskenovaný dokument.\n\nDěkujeme`
  })
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const label = documentType === "dpp" ? "DPP" : "Prohlášení"
  const hasMissing = missingFields.length > 0

  function handleSend() {
    startTransition(async () => {
      const result = await sendDocumentAction({
        brigadnik_id: brigadnikId,
        document_type: documentType,
        mesic,
        body_html: `<div>${body.replace(/\n/g, "<br/>")}</div>`,
      })

      if (result.success) {
        toast.success(`${label} odesláno emailem`)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error ?? `Nepodařilo se odeslat ${label}`)
      }
    })
  }

  const mesicLabel = new Date(mesic).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" />
          Odeslat {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Odeslat {label} — {brigadnikName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Month selector */}
          <div>
            <label className="text-sm font-medium">Měsíc</label>
            <input
              type="month"
              value={mesic.slice(0, 7)}
              onChange={(e) => setMesic(`${e.target.value}-01`)}
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
            />
          </div>

          {/* Missing fields warning */}
          {hasMissing ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm font-medium text-yellow-800">Chybějící údaje:</p>
              <ul className="text-sm text-yellow-700 mt-1 list-disc pl-4">
                {missingFields.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Button
                variant="link"
                size="sm"
                className="mt-2 p-0 text-yellow-800"
                onClick={() => {
                  setOpen(false)
                  router.push(`/app/brigadnici/${brigadnikId}`)
                }}
              >
                Doplnit údaje →
              </Button>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">✅ Všechny údaje vyplněny</p>
            </div>
          )}

          {/* Email body */}
          <div>
            <label className="text-sm font-medium">Text emailu</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full min-h-[120px] border rounded-lg px-3 py-2 text-sm mt-1 resize-none"
              disabled={isPending}
            />
          </div>

          {/* PDF preview info */}
          <div className="text-xs text-muted-foreground bg-muted rounded-lg p-2">
            📎 {label}_{brigadnikName.replace(/\s/g, "_")}_{mesic.slice(0, 7)}.pdf bude vygenerováno a přiloženo automaticky
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button
              onClick={handleSend}
              disabled={isPending || hasMissing}
            >
              <Send className="h-4 w-4 mr-2" />
              {isPending ? "Generuji a odesílám..." : `Vygenerovat a odeslat`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
