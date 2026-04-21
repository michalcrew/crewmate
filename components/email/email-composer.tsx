"use client"

import { useState, useTransition, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { sendEmailAction, replyToThread } from "@/lib/actions/email"
import { uploadEmailAttachmentPending } from "@/lib/actions/email-attachments"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Send, Paperclip } from "lucide-react"
import {
  AttachmentList,
  validateAttachmentFile,
  type ComposerAttachment,
} from "./attachment-list"

/**
 * F-0014 Rewrite:
 * - `compact` varianta = inline reply composer v thread detail (používá replyToThread)
 * - Plná varianta (compact=false) = Nový email (sendEmailAction)
 * - Attachment upload — 2-fázové (upload do pending/ → storage path, pak send
 *   s `attachment_draft_ids: string[]`).
 * - `threadId`/`replyAll` propagovány pro reply flow.
 */
export function EmailComposer({
  brigadnikId,
  brigadnikEmail,
  defaultSubject = "",
  defaultCc,
  threadId,
  replyAll = false,
  compact = false,
  onSuccess,
}: {
  brigadnikId: string
  brigadnikEmail: string
  defaultSubject?: string
  defaultCc?: string[]
  threadId?: string
  replyAll?: boolean
  compact?: boolean
  onSuccess?: () => void
}) {
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState("")
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [isPending, startTransition] = useTransition()
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const totalBytes = attachments.reduce((s, a) => s + a.size_bytes, 0)
  const anyUploading = attachments.some((a) => a.state === "uploading")

  const uploadFile = useCallback(async (clientId: string, file: File) => {
    setAttachments((prev) =>
      prev.map((a) =>
        a.clientId === clientId ? { ...a, state: "uploading", progress: 10 } : a
      )
    )

    const formData = new FormData()
    formData.append("file", file)
    const res = await uploadEmailAttachmentPending(formData)

    setAttachments((prev) =>
      prev.map((a) => {
        if (a.clientId !== clientId) return a
        if ("error" in res) {
          return { ...a, state: "error", error: res.error, progress: 0 }
        }
        return {
          ...a,
          state: "uploaded",
          attachmentId: res.attachmentDraftId,
          storagePath: res.storage_path,
          progress: 100,
        }
      })
    )
  }, [])

  const addFiles = useCallback(
    (files: File[]) => {
      let runningTotal = totalBytes
      const next: ComposerAttachment[] = []
      for (const file of files) {
        const result = validateAttachmentFile(file, runningTotal)
        if (!result.ok) {
          toast.error(result.error)
          continue
        }
        runningTotal += file.size
        const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        next.push({
          clientId,
          filename: file.name,
          size_bytes: file.size,
          mime_type: file.type,
          state: "pending",
          progress: 0,
        })
        void uploadFile(clientId, file)
      }
      if (next.length > 0) {
        setAttachments((prev) => [...prev, ...next])
      }
    },
    [totalBytes, uploadFile]
  )

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    addFiles(files)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function removeAttachment(clientId: string) {
    setAttachments((prev) => prev.filter((a) => a.clientId !== clientId))
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length > 0) addFiles(files)
  }

  function handleSend() {
    if (!body.trim()) {
      toast.error("Napište text emailu")
      return
    }
    if (anyUploading) {
      toast.error("Počkejte na dokončení nahrávání příloh")
      return
    }
    const draftIds = attachments
      .filter((a) => a.state === "uploaded" && a.attachmentId)
      .map((a) => a.attachmentId as string)
    const hasFailed = attachments.some((a) => a.state === "error")
    if (hasFailed) {
      toast.error("Některé přílohy se nepodařilo nahrát. Odstraňte je nebo zkuste znovu.")
      return
    }

    startTransition(async () => {
      const bodyHtml = `<div>${body.replace(/\n/g, "<br/>")}</div>`

      if (threadId) {
        // Reply path (ADR-1A)
        const res = await replyToThread(threadId, bodyHtml, {
          replyAll,
          attachmentDraftIds: draftIds.length > 0 ? draftIds : undefined,
        })
        if ("success" in res) {
          toast.success(replyAll ? "Odpověď odeslána všem" : "Odpověď odeslána")
          setBody("")
          setAttachments([])
          onSuccess?.()
          router.refresh()
        } else {
          toast.error(res.error ?? "Nepodařilo se odeslat odpověď")
        }
        return
      }

      // Nový email
      const result = await sendEmailAction({
        brigadnik_id: brigadnikId,
        subject: subject || defaultSubject || "Bez předmětu",
        body_html: bodyHtml,
        document_type: "plain",
        ...(draftIds.length > 0 ? { attachment_draft_ids: draftIds } : {}),
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
            placeholder={replyAll ? "Napište odpověď všem..." : "Napište odpověď..."}
            className="flex-1 min-h-[60px] max-h-[150px] rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isPending}
            aria-label="Text odpovědi"
          />
          <div className="flex flex-col gap-1 self-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
              className="h-8 w-8"
              aria-label="Přidat přílohu"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSend}
              disabled={isPending || !body.trim() || anyUploading}
              size="icon"
              className="h-8 w-8"
              aria-label="Odeslat"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {defaultCc && defaultCc.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            Kopie: {defaultCc.join(", ")}
          </div>
        )}
        <div className="mt-2">
          <AttachmentList items={attachments} onRemove={removeAttachment} />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    )
  }

  // Plný compose (používá se ve Sheet wrapperu)
  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="text-sm">
        <span className="text-muted-foreground">Komu: </span>
        <span className="font-medium">{brigadnikEmail}</span>
      </div>

      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Předmět"
        className="border rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary"
        disabled={isPending}
        aria-label="Předmět emailu"
      />

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative flex-1 flex flex-col border rounded-lg transition-colors ${
          isDragging ? "border-primary bg-primary/5" : ""
        }`}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Text emailu..."
          className="flex-1 min-h-[400px] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none bg-transparent"
          disabled={isPending}
          aria-label="Text emailu"
        />
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-lg pointer-events-none">
            <span className="text-sm font-medium">Pusťte soubory pro nahrání</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
            aria-label="Přidat přílohu"
          >
            <Paperclip className="h-4 w-4 mr-2" aria-hidden="true" />
            Přidat přílohu
          </Button>
          <span className="text-xs text-muted-foreground">
            Max 25 MB celkem. PDF, obrázky, DOC, XLS, ZIP.
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <AttachmentList
          items={attachments}
          onRemove={removeAttachment}
          onRetry={(clientId) => removeAttachment(clientId)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          onClick={handleSend}
          disabled={isPending || !body.trim() || anyUploading}
        >
          <Send className="h-4 w-4 mr-2" aria-hidden="true" />
          {isPending ? "Odesílání…" : "Odeslat"}
        </Button>
      </div>
    </div>
  )
}
