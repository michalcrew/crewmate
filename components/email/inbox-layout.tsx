"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import type { EmailThread, ConversationStatus } from "@/types/email"
import { ConversationStatusBadge } from "./conversation-status-badge"
import { cn } from "@/lib/utils"

const STATUS_TABS: { label: string; value: ConversationStatus | undefined; color: string }[] = [
  { label: "Vše", value: undefined, color: "" },
  { label: "Nové", value: "nove", color: "bg-red-500" },
  { label: "Čeká na nás", value: "ceka_na_nas", color: "bg-orange-500" },
  { label: "Čeká na brigádníka", value: "ceka_na_brigadnika", color: "bg-yellow-500" },
  { label: "Vyřešené", value: "vyreseno", color: "bg-green-500" },
]

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return "právě teď"
  if (diffMin < 60) return `${diffMin} min`
  if (diffHr < 24) return `${diffHr} hod`
  if (diffDay < 7) return `${diffDay} d`
  return date.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })
}

export function InboxLayout({
  threads,
  total,
  currentStatus,
  currentPage,
}: {
  threads: EmailThread[]
  total: number
  currentStatus?: ConversationStatus
  currentPage: number
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <div className="flex-1 flex flex-col gap-4 p-4">
      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => {
              const params = new URLSearchParams()
              if (tab.value) params.set("status", tab.value)
              router.push(`/app/emaily${params.toString() ? `?${params}` : ""}`)
            }}
            className={cn(
              "px-3 py-1.5 text-sm rounded-full border transition-colors",
              currentStatus === tab.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            )}
          >
            {tab.color && (
              <span className={cn("inline-block w-2 h-2 rounded-full mr-1.5", tab.color)} />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {threads.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-lg font-medium">Zatím žádné emaily</p>
            <p className="text-sm mt-1">Začněte odesláním emailu z profilu brigádníka</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {threads.map((thread) => (
            <Link
              key={thread.id}
              href={`/app/emaily/${thread.id}`}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-muted",
                selectedId === thread.id && "bg-muted border-primary"
              )}
              onClick={() => setSelectedId(thread.id)}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
                {thread.brigadnik
                  ? `${thread.brigadnik.jmeno[0]}${thread.brigadnik.prijmeni[0]}`
                  : "?"}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">
                    {thread.brigadnik
                      ? `${thread.brigadnik.jmeno} ${thread.brigadnik.prijmeni}`
                      : "Nepřiřazený"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRelativeTime(thread.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm text-muted-foreground truncate">
                    {thread.last_message_preview || thread.subject}
                  </span>
                  <ConversationStatusBadge status={thread.status} size="sm" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
