"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConversationStatusBadge } from "./conversation-status-badge"
import { EmailComposer } from "./email-composer"
import type { EmailThread, EmailMessage, ConversationStatus } from "@/types/email"
import { updateConversationStatus } from "@/lib/actions/email"
import { cn } from "@/lib/utils"

function MessageBubble({ message }: { message: EmailMessage }) {
  const isOutbound = message.direction === "outbound"
  const senderName = isOutbound
    ? message.sent_by ? `${message.sent_by.jmeno} ${message.sent_by.prijmeni}` : "Vy"
    : message.from_name ?? message.from_email

  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg p-4",
          isOutbound
            ? "bg-primary/10 border border-primary/20"
            : "bg-muted border border-border"
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium">
            {isOutbound ? "📤" : "📥"} {senderName}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.sent_at).toLocaleString("cs-CZ", {
              day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </span>
        </div>

        {/* Body */}
        <div
          className="text-sm prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: message.body_html || message.body_text }}
        />

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {message.attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 text-xs bg-background rounded px-2 py-1 border"
              >
                <span>📎</span>
                <span className="truncate">{att.filename}</span>
                <span className="text-muted-foreground shrink-0">
                  ({Math.round(att.size_bytes / 1024)} KB)
                </span>
                {att.classified_as && (
                  <span className="ml-auto text-green-600 shrink-0">
                    ✅ {att.classified_as}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ThreadDetail({
  thread,
  messages,
}: {
  thread: EmailThread
  messages: EmailMessage[]
}) {
  const [status, setStatus] = useState<ConversationStatus>(thread.status)

  async function handleStatusChange(newStatus: ConversationStatus) {
    setStatus(newStatus)
    await updateConversationStatus({ thread_id: thread.id, status: newStatus })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Link href="/app/emaily">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{thread.subject}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            {thread.brigadnik && (
              <Link
                href={`/app/brigadnici/${thread.brigadnik.id}`}
                className="text-sm text-primary hover:underline"
              >
                {thread.brigadnik.jmeno} {thread.brigadnik.prijmeni}
              </Link>
            )}
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value as ConversationStatus)}
              className="text-xs border rounded px-2 py-1"
            >
              <option value="nove">Nové</option>
              <option value="ceka_na_brigadnika">Čeká na brigádníka</option>
              <option value="ceka_na_nas">Čeká na nás</option>
              <option value="vyreseno">Vyřešeno</option>
            </select>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* Reply composer */}
      {thread.brigadnik && (
        <EmailComposer
          brigadnikId={thread.brigadnik.id}
          brigadnikEmail={thread.brigadnik.email}
          defaultSubject={`Re: ${thread.subject}`}
          threadId={thread.id}
          compact
        />
      )}
    </div>
  )
}
