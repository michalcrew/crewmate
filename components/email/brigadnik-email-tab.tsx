"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { EmailComposer } from "./email-composer"
import { ConversationStatusBadge } from "./conversation-status-badge"
import { DocumentSendModal } from "./document-send-modal"
import type { EmailThread } from "@/types/email"
import { Button } from "@/components/ui/button"
import { Mail, FileText } from "lucide-react"

export function BrigadnikEmailTab({
  brigadnikId,
  brigadnikEmail,
  brigadnikName,
  missingDppFields,
  missingProhlaseniFields,
  threads,
}: {
  brigadnikId: string
  brigadnikEmail: string
  brigadnikName: string
  missingDppFields: string[]
  missingProhlaseniFields: string[]
  threads: EmailThread[]
}) {
  const [showComposer, setShowComposer] = useState(false)

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowComposer(!showComposer)}>
          <Mail className="h-4 w-4 mr-2" />
          Nový email
        </Button>
        <DocumentSendModal
          brigadnikId={brigadnikId}
          brigadnikName={brigadnikName}
          documentType="dpp"
          missingFields={missingDppFields}
        />
        <DocumentSendModal
          brigadnikId={brigadnikId}
          brigadnikName={brigadnikName}
          documentType="prohlaseni"
          missingFields={missingProhlaseniFields}
        />
      </div>

      {/* Composer */}
      {showComposer && (
        <EmailComposer
          brigadnikId={brigadnikId}
          brigadnikEmail={brigadnikEmail}
          onSuccess={() => setShowComposer(false)}
        />
      )}

      {/* Conversations */}
      {threads.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>Zatím žádná emailová komunikace</p>
          <p className="text-sm mt-1">Klikněte na "Nový email" výše</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Konverzace</h4>
          {threads.map((thread) => (
            <Link
              key={thread.id}
              href={`/app/emaily/${thread.id}`}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{thread.subject}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {thread.last_message_preview}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <ConversationStatusBadge status={thread.status} size="sm" />
                <span className="text-xs text-muted-foreground">
                  {new Date(thread.last_message_at).toLocaleDateString("cs-CZ")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
