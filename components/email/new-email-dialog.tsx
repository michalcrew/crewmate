"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { sendEmailAction } from "@/lib/actions/email"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Send, Search } from "lucide-react"

export function NewEmailDialog({
  brigadnici,
}: {
  brigadnici: { id: string; jmeno: string; prijmeni: string; email: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [selectedBrigadnik, setSelectedBrigadnik] = useState<string>("")
  const [search, setSearch] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const filtered = brigadnici.filter(b =>
    `${b.jmeno} ${b.prijmeni} ${b.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const selected = brigadnici.find(b => b.id === selectedBrigadnik)

  function handleSend() {
    if (!selectedBrigadnik || !body.trim()) {
      toast.error("Vyberte brigádníka a napište text emailu")
      return
    }

    startTransition(async () => {
      const result = await sendEmailAction({
        brigadnik_id: selectedBrigadnik,
        subject: subject || "Bez předmětu",
        body_html: `<div>${body.replace(/\n/g, "<br/>")}</div>`,
        document_type: "plain",
      })

      if (result.success) {
        toast.success("Email odeslán")
        setOpen(false)
        setSelectedBrigadnik("")
        setSubject("")
        setBody("")
        router.refresh()
        if (result.thread_id) {
          router.push(`/app/emaily/${result.thread_id}`)
        }
      } else {
        toast.error(result.error ?? "Nepodařilo se odeslat email")
      }
    })
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

          {/* Subject */}
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Předmět"
            className="border rounded-lg px-3 py-2 text-sm"
            disabled={isPending}
          />

          {/* Body */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Text emailu..."
            className="min-h-[120px] border rounded-lg px-3 py-2 text-sm resize-none"
            disabled={isPending}
          />

          {/* Send */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button onClick={handleSend} disabled={isPending || !selectedBrigadnik || !body.trim()}>
              <Send className="h-4 w-4 mr-2" />
              {isPending ? "Odesílání..." : "Odeslat"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
