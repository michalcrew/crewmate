"use client"

import { useState, useTransition } from "react"
import { Lock, LockOpen, Pencil, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { lockMesic, unlockMesic } from "@/lib/actions/vyplata"

interface Props {
  mesic: string
  mesicLabel: string
  isLocked: boolean
  isAdmin: boolean
  overrideAcked: boolean
  onAckOverride: () => void
  onCancelOverride: () => void
}

/**
 * Tlačítka pro správu uzamčení měsíce + admin override pro úpravy v zamčeném měsíci.
 * - Admin: vidí Uzamknout / Odemknout + (když uzamčeno) Povolit úpravy
 * - Náborář: žádná tlačítka — uzamčeno = read-only
 */
export function LockControls({
  mesic,
  mesicLabel,
  isLocked,
  isAdmin,
  overrideAcked,
  onAckOverride,
  onCancelOverride,
}: Props) {
  const [lockOpen, setLockOpen] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  if (!isAdmin) return null

  const handleLock = () => {
    startTransition(async () => {
      const r = await lockMesic(mesic)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success(`Měsíc ${mesicLabel} uzamčen`)
      setLockOpen(false)
      router.refresh()
    })
  }

  const handleUnlock = () => {
    startTransition(async () => {
      const r = await unlockMesic(mesic)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      toast.success(`Měsíc ${mesicLabel} odemčen`)
      setUnlockOpen(false)
      onCancelOverride()
      router.refresh()
    })
  }

  const handleOverride = () => {
    onAckOverride()
    setOverrideOpen(false)
    toast.success("Úpravy povoleny pro tuto seanci")
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!isLocked && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLockOpen(true)}
          disabled={pending}
        >
          <Lock className="h-3.5 w-3.5 mr-1.5" />
          Uzamknout měsíc
        </Button>
      )}

      {isLocked && (
        <>
          {!overrideAcked ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOverrideOpen(true)}
              disabled={pending}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Povolit úpravy
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancelOverride}
              disabled={pending}
            >
              <Undo2 className="h-3.5 w-3.5 mr-1.5" />
              Zrušit úpravy
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUnlockOpen(true)}
            disabled={pending}
          >
            <LockOpen className="h-3.5 w-3.5 mr-1.5" />
            Odemknout měsíc
          </Button>
        </>
      )}

      {/* Lock confirm */}
      <Dialog open={lockOpen} onOpenChange={setLockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uzamknout měsíc {mesicLabel}?</DialogTitle>
            <DialogDescription>
              Po uzamčení nikdo nebude moct upravovat sazby, bonusy ani
              hodiny v tomto měsíci. Admin může zámek kdykoliv otevřít zpátky.
              Tabulka půjde stáhnout jako XLSX.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLockOpen(false)}
              disabled={pending}
            >
              Zrušit
            </Button>
            <Button onClick={handleLock} disabled={pending}>
              {pending ? "Uzamykám…" : "Uzamknout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlock confirm */}
      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odemknout měsíc {mesicLabel}?</DialogTitle>
            <DialogDescription>
              Měsíc bude znovu otevřený k úpravám pro všechny adminy
              i náborářky.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnlockOpen(false)}
              disabled={pending}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleUnlock}
              disabled={pending}
            >
              {pending ? "Odemykám…" : "Odemknout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override confirm */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upravit uzamčený měsíc?</DialogTitle>
            <DialogDescription>
              Tabulka za {mesicLabel} je <strong>uzamčená</strong>. Pokud opravdu
              chceš upravovat sazby nebo bonusy v tomto měsíci, potvrď. Úpravy
              budou povolené dokud nezavřeš tuto stránku nebo neklikneš
              „Zrušit úpravy".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOverrideOpen(false)}
            >
              Zrušit
            </Button>
            <Button onClick={handleOverride}>Povolit úpravy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
