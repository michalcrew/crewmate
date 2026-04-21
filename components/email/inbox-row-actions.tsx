"use client"

import { useTransition, useState } from "react"
import { Check, Mail, Archive, ArchiveRestore } from "lucide-react"
import { Button } from "@/components/ui/button"
import { markThreadRead, archiveThread } from "@/lib/actions/email-inbox"
import { toast } from "sonner"

/**
 * F-0014 1F — inline per-row akce: toggle read + archive.
 */
export function InboxRowActions({
  threadId,
  isRead,
  archived,
}: {
  threadId: string
  isRead: boolean
  archived: boolean
}) {
  const [optimisticRead, setOptimisticRead] = useState(isRead)
  const [optimisticArchived, setOptimisticArchived] = useState(archived)
  const [isPending, startTransition] = useTransition()

  function handleToggleRead(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const next = !optimisticRead
    setOptimisticRead(next)
    startTransition(async () => {
      const res = await markThreadRead(threadId, next)
      if ("error" in res) {
        setOptimisticRead(!next)
        toast.error(res.error)
      }
    })
  }

  function handleToggleArchive(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const next = !optimisticArchived
    setOptimisticArchived(next)
    startTransition(async () => {
      const res = await archiveThread(threadId, next)
      if ("error" in res) {
        setOptimisticArchived(!next)
        toast.error(res.error)
      } else {
        toast.success(next ? "Archivováno" : "Vráceno do doručených")
      }
    })
  }

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleToggleRead}
        disabled={isPending}
        aria-label={optimisticRead ? "Označit jako nepřečtené" : "Označit jako přečtené"}
        title={optimisticRead ? "Označit jako nepřečtené" : "Označit jako přečtené"}
      >
        {optimisticRead ? (
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleToggleArchive}
        disabled={isPending}
        aria-label={optimisticArchived ? "Obnovit z archivu" : "Archivovat"}
        title={optimisticArchived ? "Obnovit z archivu" : "Archivovat"}
      >
        {optimisticArchived ? (
          <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </Button>
    </div>
  )
}
