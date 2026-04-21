"use client"

import { useState } from "react"
import Link from "next/link"
import { EmailComposeSheet } from "./email-compose-sheet"
import { ConversationStatusBadge } from "./conversation-status-badge"
import { DocumentSendModal } from "./document-send-modal"
import { SendDotaznikDialog } from "@/components/brigadnici/send-dotaznik-dialog"
import { KomunikaceTimeline } from "@/components/brigadnici/komunikace-timeline"
import type { EmailThread } from "@/types/email"
import type { KomunikaceTimelineItem } from "@/lib/actions/email"
import { Button } from "@/components/ui/button"
import { Mail } from "lucide-react"

export function BrigadnikEmailTab({
  brigadnikId,
  brigadnikEmail,
  brigadnikName,
  missingDppFields,
  missingProhlaseniFields,
  threads,
  timeline = [],
}: {
  brigadnikId: string
  brigadnikEmail: string
  brigadnikName: string
  missingDppFields: string[]
  missingProhlaseniFields: string[]
  threads: EmailThread[]
  /** F-0014 1D — sjednocená historie komunikačních událostí */
  timeline?: KomunikaceTimelineItem[]
}) {
  const [view, setView] = useState<"timeline" | "konverzace">("timeline")

  return (
    <div className="space-y-4">
      {/* F-0014 1C — akční tlačítka v pořadí: Nový email | Dotazník | DPP | Prohlášení */}
      <div className="flex flex-wrap gap-2">
        <EmailComposeSheet
          brigadnikId={brigadnikId}
          brigadnikEmail={brigadnikEmail}
          trigger={
            <Button variant="outline" size="sm" aria-label="Nový email">
              <Mail className="h-4 w-4 mr-2" aria-hidden="true" />
              Nový email
            </Button>
          }
        />
        <SendDotaznikDialog
          brigadnikId={brigadnikId}
          brigadnikEmail={brigadnikEmail}
        />
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

      {/* View switcher timeline / konverzace */}
      <div className="flex gap-2 border-b">
        <button
          type="button"
          onClick={() => setView("timeline")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view === "timeline"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          aria-pressed={view === "timeline"}
        >
          Historie komunikace
        </button>
        <button
          type="button"
          onClick={() => setView("konverzace")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view === "konverzace"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          aria-pressed={view === "konverzace"}
        >
          Konverzace ({threads.length})
        </button>
      </div>

      {view === "timeline" ? (
        <KomunikaceTimeline items={timeline} />
      ) : threads.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>Zatím žádná emailová komunikace</p>
          <p className="text-sm mt-1">Klikněte na „Nový email" výše</p>
        </div>
      ) : (
        <div className="space-y-2">
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
