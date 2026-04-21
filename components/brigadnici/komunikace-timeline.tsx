"use client"

import { useState } from "react"
import { Mail, MailOpen, FileText, ClipboardList, ShieldCheck, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react"
import type { KomunikaceTimelineItem } from "@/lib/actions/email"

/**
 * F-0014 1D — unified komunikace timeline.
 * Typ IN ('email_odeslan', 'email_prijaty', 'dotaznik_odeslan',
 *         'dotaznik_vyplnen', 'dotaznik_token_invalidovan',
 *         'dpp_odeslana', 'dpp_podepsana', 'prohlaseni_odeslano')
 * DESC chronologie.
 */
const TYP_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  email_odeslan: { label: "Email odeslán", icon: Mail, color: "text-blue-500" },
  email_prijaty: { label: "Email přijat", icon: MailOpen, color: "text-green-600" },
  dotaznik_odeslan: { label: "Dotazník odeslán", icon: ClipboardList, color: "text-purple-500" },
  dotaznik_vyplnen: { label: "Dotazník vyplněn", icon: ClipboardList, color: "text-green-600" },
  dotaznik_token_invalidovan: {
    label: "Dotazníkový odkaz zneplatněn",
    icon: AlertTriangle,
    color: "text-amber-500",
  },
  dpp_odeslana: { label: "DPP odeslána", icon: FileText, color: "text-blue-500" },
  dpp_podepsana: { label: "DPP podepsána", icon: ShieldCheck, color: "text-green-600" },
  prohlaseni_odeslano: { label: "Prohlášení odesláno", icon: FileText, color: "text-blue-500" },
}

export function KomunikaceTimeline({ items }: { items: KomunikaceTimelineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Zatím žádná komunikace.
      </div>
    )
  }

  return (
    <ol className="flex flex-col gap-2" role="list">
      {items.map((item) => (
        <TimelineRow key={item.id} item={item} />
      ))}
    </ol>
  )
}

function TimelineRow({ item }: { item: KomunikaceTimelineItem }) {
  const [expanded, setExpanded] = useState(false)
  const meta = TYP_META[item.typ] ?? {
    label: item.typ,
    icon: Mail,
    color: "text-muted-foreground",
  }
  const Icon = meta.icon
  const hasDetail = !!item.metadata && Object.keys(item.metadata).length > 0

  return (
    <li className="flex items-start gap-3 border rounded-lg p-3 hover:bg-muted/30 transition-colors">
      <span className={`shrink-0 mt-0.5 ${meta.color}`} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{meta.label}</span>
          <time
            className="text-xs text-muted-foreground shrink-0 tabular-nums"
            dateTime={item.created_at}
          >
            {new Date(item.created_at).toLocaleString("cs-CZ", {
              day: "numeric",
              month: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
        <p className="text-sm text-muted-foreground truncate">{item.popis}</p>
        {hasDetail && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
              aria-expanded={expanded}
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              )}
              Detail
            </button>
            {expanded && (
              <pre className="mt-2 text-[11px] bg-muted/50 rounded p-2 overflow-x-auto">
                {JSON.stringify(item.metadata, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>
    </li>
  )
}
