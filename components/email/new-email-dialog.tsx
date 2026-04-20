"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { sendEmailAction } from "@/lib/actions/email"
import { sendDocumentAction } from "@/lib/actions/email-documents"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Send, Search, FileText } from "lucide-react"

type EmailType = "plain" | "dpp" | "prohlaseni"

export function NewEmailDialog({
  brigadnici,
}: {
  brigadnici: { id: string; jmeno: string; prijmeni: string; email: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [selectedBrigadnik, setSelectedBrigadnik] = useState<string>("")
  const [search, setSearch] = useState("")
  const [emailType, setEmailType] = useState<EmailType>("plain")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [rok, setRok] = useState<number>(() => new Date().getFullYear())
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const filtered = brigadnici.filter(b =>
    `${b.jmeno} ${b.prijmeni} ${b.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const selected = brigadnici.find(b => b.id === selectedBrigadnik)

  function handleSend() {
    if (!selectedBrigadnik) {
      toast.error("Vyberte brigádníka")
      return
    }

    startTransition(async () => {
      if (emailType === "dpp" || emailType === "prohlaseni") {
        // Send document (DPP/prohlášení with PDF)
        const defaultBody = emailType === "dpp"
          ? "Dobrý den,\n\nv příloze Vám zasíláme DPP k podpisu.\n\nProsím vytiskněte, podepište a pošlete zpět.\n\nDěkujeme"
          : "Dobrý den,\n\nv příloze Vám zasíláme prohlášení poplatníka k podpisu.\n\nProsím vyplňte datum, podepište a pošlete zpět.\n\nDěkujeme"

        const result = await sendDocumentAction({
          brigadnik_id: selectedBrigadnik,
          document_type: emailType,
          rok,
          body_html: `<div>${(body || defaultBody).replace(/\n/g, "<br/>")}</div>`,
        })

        if (result.success) {
          toast.success(`${emailType === "dpp" ? "DPP" : "Prohlášení"} odesláno s PDF přílohou`)
          resetAndClose()
          if (result.thread_id) router.push(`/app/emaily/${result.thread_id}`)
        } else {
          toast.error(result.error ?? "Nepodařilo se odeslat")
        }
      } else {
        // Send plain email
        if (!body.trim()) {
          toast.error("Napište text emailu")
          return
        }

        const result = await sendEmailAction({
          brigadnik_id: selectedBrigadnik,
          subject: subject || "Bez předmětu",
          body_html: `<div>${body.replace(/\n/g, "<br/>")}</div>`,
          document_type: "plain",
        })

        if (result.success) {
          toast.success("Email odeslán")
          resetAndClose()
          if (result.thread_id) router.push(`/app/emaily/${result.thread_id}`)
        } else {
          toast.error(result.error ?? "Nepodařilo se odeslat email")
        }
      }
    })
  }

  function resetAndClose() {
    setOpen(false)
    setSelectedBrigadnik("")
    setSubject("")
    setBody("")
    setEmailType("plain")
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nový email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nový email</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Brigadník selector */}
          {!selected ? (
            <div>
              <label className="text-sm font-medium">Komu</label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Hledat brigádníka..."
                  className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <div className="max-h-40 overflow-y-auto mt-1 border rounded-lg">
                {filtered.slice(0, 10).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => { setSelectedBrigadnik(b.id); setSearch(""); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    <span className="font-medium">{b.jmeno} {b.prijmeni}</span>
                    <span className="text-muted-foreground ml-2">{b.email}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">Nenalezeno</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
              <span className="text-sm">
                <span className="font-medium">{selected.jmeno} {selected.prijmeni}</span>
                <span className="text-muted-foreground ml-2">{selected.email}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedBrigadnik("")}>
                Změnit
              </Button>
            </div>
          )}

          {/* Email type */}
          <div>
            <label className="text-sm font-medium">Typ emailu</label>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setEmailType("plain")}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  emailType === "plain" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                Běžný email
              </button>
              <button
                onClick={() => setEmailType("dpp")}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  emailType === "dpp" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <FileText className="h-3 w-3 inline mr-1" />
                DPP
              </button>
              <button
                onClick={() => setEmailType("prohlaseni")}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  emailType === "prohlaseni" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <FileText className="h-3 w-3 inline mr-1" />
                Prohlášení
              </button>
            </div>
          </div>

          {/* Year selector for DPP/prohlášení (F-0013: per-rok) */}
          {(emailType === "dpp" || emailType === "prohlaseni") && (
            <div>
              <label className="text-sm font-medium">Rok</label>
              <input
                type="number"
                min={2020}
                max={2100}
                value={rok}
                onChange={(e) => setRok(Number(e.target.value) || new Date().getFullYear())}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                📎 PDF bude vygenerováno a přiloženo automaticky
              </p>
            </div>
          )}

          {/* Subject (only for plain email) */}
          {emailType === "plain" && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Předmět"
              className="border rounded-lg px-3 py-2 text-sm"
              disabled={isPending}
            />
          )}

          {/* Body */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={emailType === "plain" ? "Text emailu..." : "Text emailu (volitelné — použije se šablona)..."}
            className="min-h-[100px] border rounded-lg px-3 py-2 text-sm resize-none"
            disabled={isPending}
          />

          {/* Send */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button onClick={handleSend} disabled={isPending || !selectedBrigadnik}>
              <Send className="h-4 w-4 mr-2" />
              {isPending ? "Odesílání..." : emailType === "plain" ? "Odeslat" : `Odeslat ${emailType === "dpp" ? "DPP" : "prohlášení"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
