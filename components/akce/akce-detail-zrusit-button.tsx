"use client"

import { useState } from "react"
import { Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ZrusitAkciDialog } from "./zrusit-akci-dialog"

/**
 * F-0015 US-1C-2 — Destructive button v headeru detailu akce.
 * Sám řídí dialog state. Parent ho renderuje pouze pro stav='planovana'.
 */
export function AkceDetailZrusitButton({
  akceId,
  akceName,
  akceDate,
}: {
  akceId: string
  akceName: string
  akceDate: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Ban className="h-4 w-4 mr-1.5" />
        Zrušit akci
      </Button>
      <ZrusitAkciDialog
        open={open}
        onOpenChange={setOpen}
        akceId={akceId}
        akceName={akceName}
        akceDate={akceDate}
      />
    </>
  )
}
