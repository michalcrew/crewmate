"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Virtuoso } from "react-virtuoso"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { DochazkaRow, type DochazkaRowEntry } from "./dochazka-row"
import type { DochazkaEditor } from "@/lib/actions/dochazka"

type Props = {
  akceId: string
  editor: DochazkaEditor
  entries: DochazkaRowEntry[]
  onRefresh?: () => Promise<void> | void
}

const STATUS_ORDER: Record<string, number> = {
  prirazeny: 0,
  nahradnik: 1,
  vypadl: 2,
}

function sortEntries(entries: DochazkaRowEntry[]): DochazkaRowEntry[] {
  return [...entries].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99
    const sb = STATUS_ORDER[b.status] ?? 99
    if (sa !== sb) return sa - sb
    return a.brigadnik.prijmeni.localeCompare(b.brigadnik.prijmeni, "cs")
  })
}

export function DochazkaGridV2({ akceId, editor, entries, onRefresh }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const sorted = useMemo(() => sortEntries(entries), [entries])
  // global retry queue (fieldKey set)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const hasFailedRef = useRef(false)

  const addFailed = (key: string) => {
    setFailed((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }
  const removeFailed = (key: string) => {
    setFailed((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  // Persistent sonner toast reflecting queue
  useEffect(() => {
    const count = failed.size
    if (count > 0) {
      toast.warning(`${count} záznam${count === 1 ? "" : count < 5 ? "y" : "ů"} neuloženo, zkouším…`, {
        id: "dochazka-retry",
        duration: Infinity,
      })
      hasFailedRef.current = true
    } else if (hasFailedRef.current) {
      toast.dismiss("dochazka-retry")
      hasFailedRef.current = false
    }
  }, [failed])

  // Refresh hook: every 30s while queue non-empty, do soft refresh (router.refresh)
  useEffect(() => {
    if (failed.size === 0) return
    const interval = setInterval(() => {
      startTransition(() => {
        if (onRefresh) {
          void onRefresh()
        } else {
          router.refresh()
        }
      })
    }, 30000)
    return () => clearInterval(interval)
  }, [failed.size, onRefresh, router])

  const handleRowChanged = () => {
    // no-op for now; router.refresh would cause input remount
  }

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm border rounded-md">
        Žádní přiřazení brigádníci
      </div>
    )
  }

  return (
    <div
      className="h-[calc(100vh-120px)] max-h-[800px] border rounded-md bg-card overflow-hidden"
      data-testid="dochazka-grid-v2"
      data-akce-id={akceId}
    >
      <Virtuoso
        data={sorted}
        computeItemKey={(_, entry) => entry.prirazeniId}
        itemContent={(_, entry) => (
          <DochazkaRow
            {...entry}
            editor={editor}
            onFieldFailed={addFailed}
            onFieldRecovered={removeFailed}
            onRowChanged={handleRowChanged}
          />
        )}
      />
    </div>
  )
}
