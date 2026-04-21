"use client"

import { useState, ReactNode } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet"
import { EmailComposer } from "./email-composer"

/**
 * F-0014 1H — side-sheet wrapper pro „Nový email".
 * Reply composer v thread detail zůstává inline (compact variant).
 *
 * Min width 600px, max width 50% viewport, full-screen na mobilu (<640px).
 */
export function EmailComposeSheet({
  brigadnikId,
  brigadnikEmail,
  trigger,
  defaultSubject,
  onSuccess,
}: {
  brigadnikId: string
  brigadnikEmail: string
  trigger: ReactNode
  defaultSubject?: string
  onSuccess?: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<span>{trigger}</span>} />
      <SheetContent
        side="right"
        className="w-full sm:min-w-[600px] sm:max-w-[50vw] flex flex-col"
      >
        <SheetHeader>
          <SheetTitle>Nový email</SheetTitle>
          <SheetDescription>
            Napište zprávu pro {brigadnikEmail}. Lze přiložit soubory do celkem 25 MB.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <EmailComposer
            brigadnikId={brigadnikId}
            brigadnikEmail={brigadnikEmail}
            defaultSubject={defaultSubject}
            onSuccess={() => {
              setOpen(false)
              onSuccess?.()
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
