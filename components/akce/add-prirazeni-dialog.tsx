"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus } from "lucide-react"
import { addPrirazeni } from "@/lib/actions/akce"
import { toast } from "sonner"

type Brigadnik = { id: string; jmeno: string; prijmeni: string; telefon: string }

export function AddPrirazeniDialog({
  akceId,
  brigadnici,
  // Volitelné props pro UX-guard nad kapacitou + dostupností koordinátora.
  // Server validace je primární; tyto props slouží jen ke zlepšení UI.
  obsazenoBrig = 0,
  obsazenoKoord = 0,
  pocetBrigadniku = 0,
  pocetKoordinatoru = 0,
  sazbaKoordinator = null,
}: {
  akceId: string
  brigadnici: Brigadnik[]
  obsazenoBrig?: number
  obsazenoKoord?: number
  pocetBrigadniku?: number
  pocetKoordinatoru?: number
  sazbaKoordinator?: number | null
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"prirazeny" | "nahradnik">("prirazeny")
  const [role, setRole] = useState<"brigadnik" | "koordinator">("brigadnik")
  const [isPending, startTransition] = useTransition()

  const filtered = brigadnici.filter((b) => {
    const q = search.toLowerCase()
    return `${b.jmeno} ${b.prijmeni} ${b.telefon}`.toLowerCase().includes(q)
  })

  const koordPovolen = sazbaKoordinator != null
  const brigPlny = pocetBrigadniku > 0 && obsazenoBrig >= pocetBrigadniku
  const koordPlny = pocetKoordinatoru > 0 && obsazenoKoord >= pocetKoordinatoru
  const obsazeniHint =
    status === "prirazeny"
      ? role === "brigadnik"
        ? brigPlny ? "Kapacita brigádníků je plná, přidejte jako náhradníka." : null
        : koordPlny ? "Kapacita koordinátorů je plná, přidejte jako náhradníka." : null
      : null

  function handleAdd(brigadnikId: string) {
    startTransition(async () => {
      const result = await addPrirazeni({
        akceId,
        brigadnikId,
        status,
        role: status === "prirazeny" ? role : undefined,
      })
      if ("error" in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(
          status === "nahradnik"
            ? "Brigádník přidán jako náhradník"
            : `Brigádník přiřazen jako ${role === "koordinator" ? "koordinátor" : "brigádník"}`
        )
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Přiřadit brigádníka
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Přiřadit brigádníka na akci</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <div className="flex gap-2">
              <label className="flex-1">
                <input
                  type="radio"
                  name="status"
                  value="prirazeny"
                  checked={status === "prirazeny"}
                  onChange={() => setStatus("prirazeny")}
                  className="peer sr-only"
                />
                <div className="peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:border-primary border rounded px-3 py-2 text-sm cursor-pointer text-center">
                  Přiřazený
                </div>
              </label>
              <label className="flex-1">
                <input
                  type="radio"
                  name="status"
                  value="nahradnik"
                  checked={status === "nahradnik"}
                  onChange={() => setStatus("nahradnik")}
                  className="peer sr-only"
                />
                <div className="peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:border-primary border rounded px-3 py-2 text-sm cursor-pointer text-center">
                  Náhradník
                </div>
              </label>
            </div>
          </div>

          {status === "prirazeny" && (
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <input
                    type="radio"
                    name="role"
                    value="brigadnik"
                    checked={role === "brigadnik"}
                    onChange={() => setRole("brigadnik")}
                    className="peer sr-only"
                  />
                  <div className="peer-checked:bg-amber-500 peer-checked:text-white peer-checked:border-amber-500 border rounded px-3 py-2 text-sm cursor-pointer text-center">
                    👷 Brigádník
                  </div>
                </label>
                <label className={`flex-1 ${!koordPovolen ? "opacity-50" : ""}`}>
                  <input
                    type="radio"
                    name="role"
                    value="koordinator"
                    checked={role === "koordinator"}
                    onChange={() => setRole("koordinator")}
                    disabled={!koordPovolen}
                    className="peer sr-only"
                  />
                  <div
                    className={`peer-checked:bg-blue-600 peer-checked:text-white peer-checked:border-blue-600 border rounded px-3 py-2 text-sm text-center ${
                      koordPovolen ? "cursor-pointer" : "cursor-not-allowed"
                    }`}
                    title={!koordPovolen ? "Tato zakázka nemá povoleného koordinátora" : undefined}
                  >
                    👔 Koordinátor
                  </div>
                </label>
              </div>
              {!koordPovolen && (
                <p className="text-xs text-muted-foreground">
                  Tato zakázka nemá povoleného koordinátora.
                </p>
              )}
              {obsazeniHint && (
                <p className="text-xs text-amber-600">{obsazeniHint}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Hledat brigádníka</Label>
            <Input
              placeholder="Jméno, příjmení, telefon..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {search ? "Žádný brigádník nenalezen" : "Žádní brigádníci v systému"}
              </p>
            ) : (
              filtered.slice(0, 20).map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-muted/50"
                >
                  <div>
                    <span className="font-medium text-sm">{b.prijmeni} {b.jmeno}</span>
                    <span className="text-xs text-muted-foreground ml-2">{b.telefon}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => handleAdd(b.id)}
                  >
                    Přiřadit
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
