"use client"

import { useState, useTransition, useRef } from "react"
import { Button } from "@/components/ui/button"
import { sendEmailAction } from "@/lib/actions/email"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Send, Paperclip, X } from "lucide-react"

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
  const [attachments, setAttachments] = useState<File[]>([])
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const maxSize = 25 * 1024 * 1024 // 25MB
    const valid = files.filter(f => {
      if (f.size > maxSize) {
        toast.error(`${f.name} je příliš velký (max 25 MB)`)
        return false
      }
      return true
    })
    setAttachments(prev => [...prev, ...valid])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function removeAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  function handleSend() {
    if (!body.trim()) {
      toast.error("Napište text emailu")
      return
    }

    startTransition(async () => {
      // TODO: attachment upload to storage + include IDs
      // For now, send without attachments (text email)
      const result = await sendEmailAction({
        brigadnik_id: brigadnikId,
        subject: subject || defaultSubject || "Bez předmětu",
        body_html: `<div>${body.replace(/\n/g, "<br/>")}</div>`,
        document_type: "plain",
      })

      if (result.success) {
        toast.success("Email odeslán")
        setBody("")
        setAttachments([])
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
          <div className="flex flex-col gap-1 self-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
              className="h-8 w-8"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSend}
              disabled={isPending || !body.trim()}
              size="icon"
              className="h-8 w-8"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {attachments.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-1">
                📎 {f.name}
                <button onClick={() => removeAttachment(i)}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
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

      {/* Attachments */}
      <div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          disabled={isPending}
        >
          <Paperclip className="h-4 w-4" />
          Přidat přílohu
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {attachments.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-1">
                📎 {f.name} ({Math.round(f.size / 1024)} KB)
                <button onClick={() => removeAttachment(i)} className="hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={handleSend} disabled={isPending || !body.trim()}>
          <Send className="h-4 w-4 mr-2" />
          {isPending ? "Odesílání..." : "Odeslat"}
        </Button>
      </div>
    </div>
  )
}
