"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserPlus } from "lucide-react"
import { addBrigadnikToPipeline } from "@/lib/actions/pipeline"
import { toast } from "sonner"

type Brigadnik = { id: string; jmeno: string; prijmeni: string; telefon: string; email: string }

export function AddToPipelineDialog({
  nabidkaId,
  brigadnici,
}: {
  nabidkaId: string
  brigadnici: Brigadnik[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()

  const filtered = brigadnici.filter((b) => {
    const q = search.toLowerCase()
    return `${b.jmeno} ${b.prijmeni} ${b.telefon} ${b.email}`.toLowerCase().includes(q)
  })

  function handleAdd(brigadnikId: string) {
    startTransition(async () => {
      const result = await addBrigadnikToPipeline(brigadnikId, nabidkaId, "zajemce")
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Brigádník přidán do pipeline")
        setOpen(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm" variant="outline">
          <UserPlus className="h-4 w-4 mr-1" />
          Přidat do pipeline
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Přidat brigádníka do pipeline</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Hledat brigádníka</Label>
            <Input
              placeholder="Jméno, příjmení, email, telefon..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {search ? "Žádný brigádník nenalezen" : "Začněte psát pro vyhledání"}
              </p>
            ) : (
              filtered.slice(0, 20).map((b) => (
                <div key={b.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                  <div>
                    <span className="font-medium text-sm">{b.prijmeni} {b.jmeno}</span>
                    <span className="text-xs text-muted-foreground ml-2">{b.email}</span>
                  </div>
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleAdd(b.id)}>
                    Přidat
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
