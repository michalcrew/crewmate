"use client"

import { useState, useTransition } from "react"
import { MessageSquare, MessageSquareText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { updatePipelineEntryPoznamka } from "@/lib/actions/pipeline"
import { toast } from "sonner"

/**
 * F-0016 US-1E-1 — poznámka popover v AssignmentMatrix row.
 *
 * Minimální UX (bez @radix popover — není v deps):
 *  - Trigger: ikona 💬 (outline pokud prázdné, filled pokud existuje).
 *  - Hover (title attr): zobrazí tooltip s prvními 200 znaky.
 *  - Click: otevře inline panel pod ikonou (details/summary není ideální kvůli
 *    focus managementu, místo toho managed state + abs. pozice).
 *  - Save: Enter-Cmd / tlačítko Uložit; Esc zavře.
 *
 * Per Architect open item #1: v mobile collapsed stavu ikona stále viditelná
 * (jen indikuje že poznámka existuje), inline panel přístupný až po expand.
 */

type Props = {
  entryId: string
  initialText: string | null
  compact?: boolean // kompaktní režim pro mobile collapse
}

export function PipelineEntryPoznamkaPopover({ entryId, initialText, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(initialText ?? "")
  const [pending, startTransition] = useTransition()
  const hasText = !!(initialText && initialText.trim())

  function save() {
    startTransition(async () => {
      const res = await updatePipelineEntryPoznamka(entryId, text.slice(0, 500))
      if ("success" in res && res.success) {
        toast.success("Poznámka uložena")
        setOpen(false)
      } else if ("error" in res) {
        toast.error(res.error)
      }
    })
  }

  const tooltip =
    hasText && initialText
      ? initialText.length > 200
        ? initialText.slice(0, 200) + "… (klikněte pro celé)"
        : initialText
      : "Přidat poznámku"

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={tooltip}
        aria-label={hasText ? "Upravit poznámku" : "Přidat poznámku"}
        aria-expanded={open}
        className={`inline-flex items-center justify-center rounded p-1 hover:bg-muted ${
          hasText ? "text-blue-600" : "text-muted-foreground/60"
        }`}
      >
        {hasText ? (
          <MessageSquareText className="h-3.5 w-3.5" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5" />
        )}
      </button>

      {open && !compact && (
        <div
          className="absolute left-0 top-full mt-1 z-30 w-80 p-3 border rounded-md bg-popover shadow-lg space-y-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save()
          }}
        >
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            rows={4}
            maxLength={500}
            placeholder="Poznámka (jen pro tuto zakázku)"
            className="text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{text.length}/500</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                Zrušit
              </Button>
              <Button size="sm" onClick={save} disabled={pending}>
                {pending ? "Ukládám…" : "Uložit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </span>
  )
}
