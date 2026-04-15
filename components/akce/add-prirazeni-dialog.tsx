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
}: {
  akceId: string
  brigadnici: Brigadnik[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()

  const filtered = brigadnici.filter((b) => {
    const q = search.toLowerCase()
    return `${b.jmeno} ${b.prijmeni} ${b.telefon}`.toLowerCase().includes(q)
  })

  function handleAdd(brigadnikId: string) {
    startTransition(async () => {
      const result = await addPrirazeni(akceId, brigadnikId, "", "prirazeny")
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Brigádník přiřazen")
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
