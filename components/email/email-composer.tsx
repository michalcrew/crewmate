"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { sendEmailAction } from "@/lib/actions/email"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Send } from "lucide-react"

export function EmailComposer({
  brigadnikId,
  brigadnikEmail,
  defaultSubject = "",
  threadId,
  compact = false,
  onSuccess,
}: {
  brigadnikId: string
  brigadnikEmail: string
  defaultSubject?: string
  threadId?: string
  compact?: boolean
  onSuccess?: () => void
}) {
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSend() {
    if (!body.trim()) {
      toast.error("Napište text emailu")
      return
    }

    startTransition(async () => {
      const result = await sendEmailAction({
        brigadnik_id: brigadnikId,
        subject: subject || defaultSubject || "Bez předmětu",
        body_html: `<div>${body.replace(/\n/g, "<br/>")}</div>`,
        document_type: "plain",
      })

      if (result.success) {
        toast.success("Email odeslán")
        setBody("")
        if (!compact) setSubject("")
        onSuccess?.()
        router.refresh()
      } else {
        toast.error(result.error ?? "Nepodařilo se odeslat email")
      }
    })
  }

  if (compact) {
    return (
      <div className="border-t p-4">
        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Napište odpověď..."
            className="flex-1 min-h-[60px] max-h-[150px] rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isPending}
          />
          <Button
            onClick={handleSend}
            disabled={isPending || !body.trim()}
            size="icon"
            className="shrink-0 self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4 border rounded-lg">
      <div className="text-sm text-muted-foreground">
        Komu: <span className="font-medium text-foreground">{brigadnikEmail}</span>
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Předmět"
        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        disabled={isPending}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Text emailu..."
        className="min-h-[120px] border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        disabled={isPending}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={handleSend} disabled={isPending || !body.trim()}>
          <Send className="h-4 w-4 mr-2" />
          {isPending ? "Odesílání..." : "Odeslat"}
        </Button>
      </div>
    </div>
  )
}
