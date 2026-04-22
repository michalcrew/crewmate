"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { updateAkceStav } from "@/lib/actions/akce"
import { ZrusitAkciDialog } from "./zrusit-akci-dialog"

/**
 * F-0015 US-1E — Inline stav selector (detail akce + matrix header).
 *
 * Guards:
 *  - planovana → probehla: backend vrátí warning pokud žádná docházka → UI confirm dialog
 *  - planovana → zrusena: otevře ZrusitAkciDialog s textarea
 *  - probehla → planovana (reopen): confirm dialog "Opravdu vrátit do plánovaných?"
 *  - probehla → zrusena: backend blokne pokud kompletní docházka
 *  - zrusena → *: selector je disabled (reopen zrušené = out of scope D-08)
 */

const STAV_LABELS: Record<string, string> = {
  planovana: "Plánovaná",
  probehla: "Proběhla",
  zrusena: "Zrušená",
}

type Stav = "planovana" | "probehla" | "zrusena"

export function AkceStavSelector({
  akceId,
  akceName,
  akceDate,
  currentStav,
  size = "md",
  className,
}: {
  akceId: string
  akceName: string
  akceDate: string
  currentStav: string
  size?: "sm" | "md"
  className?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [zrusitOpen, setZrusitOpen] = useState(false)
  const [reopenConfirm, setReopenConfirm] = useState<null | { from: Stav; to: Stav }>(null)

  const isZrusena = currentStav === "zrusena"

  async function performUpdate(noviStav: Stav) {
    const res = await updateAkceStav(akceId, noviStav)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    if (res.warning) {
      // shouldn't reach here since we handle warning in UI first, but keep safe fallback
      toast.warning(res.warning)
    } else {
      toast.success(`Stav změněn na "${STAV_LABELS[noviStav]}"`)
    }
    router.refresh()
  }

  function handleChange(noviStav: string | null) {
    if (!noviStav) return
    const s = noviStav as Stav
    if (s === currentStav) return

    // probehla → planovana = reopen → confirm
    if (currentStav === "probehla" && s === "planovana") {
      setReopenConfirm({ from: "probehla", to: "planovana" })
      return
    }

    // → zrusena: otevřít ZrusitAkciDialog
    if (s === "zrusena") {
      setZrusitOpen(true)
      return
    }

    // planovana → probehla: backend update + pokud warning → toast warning (už flipnuto)
    if (currentStav === "planovana" && s === "probehla") {
      startTransition(async () => {
        const res = await updateAkceStav(akceId, "probehla")
        if ("error" in res) {
          toast.error(res.error)
          return
        }
        if (res.warning) {
          toast.warning(`${res.warning} — akce označena jako proběhlá.`)
        } else {
          toast.success(`Stav změněn na "${STAV_LABELS.probehla}"`)
        }
        router.refresh()
      })
      return
    }

    // Default: přímá change
    startTransition(async () => {
      await performUpdate(s)
    })
  }

  function confirmReopen() {
    setReopenConfirm(null)
    startTransition(async () => {
      await performUpdate("planovana")
    })
  }

  // Base UI Select.Value bez render fn vypisuje raw value ('planovana').
  // Mapujeme přes STAV_LABELS na lidský label ('Plánovaná').
  const renderLabel = (value: unknown) => STAV_LABELS[String(value)] ?? String(value)

  // zrušená: disabled select s tooltipem
  if (isZrusena) {
    return (
      <div className={className} title="Zrušenou akci nelze obnovit (out of scope)">
        <Select disabled value="zrusena">
          <SelectTrigger size={size === "sm" ? "sm" : "default"} aria-label="Stav akce">
            <SelectValue>{renderLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zrusena">Zrušená</SelectItem>
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <>
      <div className={`flex items-center gap-2 ${className ?? ""}`}>
        <Select value={currentStav} onValueChange={handleChange} disabled={isPending}>
          <SelectTrigger size={size === "sm" ? "sm" : "default"} aria-label="Změnit stav akce">
            <SelectValue>{renderLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="planovana">Plánovaná</SelectItem>
            <SelectItem value="probehla">Proběhla</SelectItem>
            <SelectItem value="zrusena">Zrušená</SelectItem>
          </SelectContent>
        </Select>
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* ZrusitAkciDialog pro → zrusena */}
      <ZrusitAkciDialog
        open={zrusitOpen}
        onOpenChange={setZrusitOpen}
        akceId={akceId}
        akceName={akceName}
        akceDate={akceDate}
      />

      {/* Confirm pro probehla → planovana (reopen) */}
      <Dialog open={reopenConfirm !== null} onOpenChange={(o) => { if (!o) setReopenConfirm(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vrátit do plánovaných?</DialogTitle>
            <DialogDescription>
              Opravdu vrátit akci &bdquo;{akceName}&ldquo; zpět do plánovaných? Docházka zůstane zachovaná,
              ale akce se znovu objeví v Plánované tabu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenConfirm(null)} disabled={isPending}>
              Zrušit
            </Button>
            <Button onClick={confirmReopen} disabled={isPending}>
              {isPending ? "Obnovuji…" : "Ano, vrátit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  )
}
