"use client"

import { useState } from "react"
import Link from "next/link"
import { MoreHorizontal, Eye, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { ZrusitAkciDialog } from "./zrusit-akci-dialog"

/**
 * F-0015 US-1C-1 — kebab menu per-row v /app/akce.
 * Zobrazí "Detail" + "Zrušit akci".
 * "Zrušit akci" skrytá pro stav='probehla' (nelze zrušit historii)
 * a zrusena (už je zrušená).
 */
export function AkceRowActions({
  akceId,
  akceName,
  akceDate,
  akceStav,
}: {
  akceId: string
  akceName: string
  akceDate: string
  akceStav: string
}) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const canCancel = akceStav === "planovana"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Akce pro tuto událost">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/app/akce/${akceId}`} />}>
            <Eye className="h-4 w-4" />
            Detail
          </DropdownMenuItem>
          {canCancel && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDialogOpen(true)}
            >
              <Ban className="h-4 w-4" />
              Zrušit akci
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ZrusitAkciDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        akceId={akceId}
        akceName={akceName}
        akceDate={akceDate}
      />
    </>
  )
}
