"use client"

import { useState, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserPlus, Search, Plus } from "lucide-react"
import { addBrigadnikToPipeline } from "@/lib/actions/pipeline"
import { createBrigadnikAndAddToPipeline } from "@/lib/actions/brigadnici"
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
  const [tab, setTab] = useState<"existing" | "new">("existing")
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
        setSearch("")
      }
    })
  }

  function handleCreateAndAdd(formData: FormData) {
    formData.set("nabidka_id", nabidkaId)
    startTransition(async () => {
      const result = await createBrigadnikAndAddToPipeline(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Brigádník vytvořen a přidán do pipeline")
        setOpen(false)
        setTab("existing")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSearch(""); setTab("existing") } }}>
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

        {/* Tab switcher */}
        <div className="flex gap-1 border-b pb-2 mb-2">
          <button
            type="button"
            onClick={() => setTab("existing")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "existing" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Search className="h-3.5 w-3.5" /> Existující
          </button>
          <button
            type="button"
            onClick={() => setTab("new")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "new" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Plus className="h-3.5 w-3.5" /> Nový brigádník
          </button>
        </div>

        {tab === "existing" ? (
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
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground mb-3">
                    {search ? "Žádný brigádník nenalezen" : "Začněte psát pro vyhledání"}
                  </p>
                  {search && (
                    <Button size="sm" variant="outline" onClick={() => setTab("new")}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Vytvořit nového brigádníka
                    </Button>
                  )}
                </div>
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
        ) : (
          <form action={handleCreateAndAdd} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vytvořte nového brigádníka a rovnou ho přidejte do pipeline této zakázky.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="new-jmeno" className="text-xs">Jméno *</Label>
                <Input id="new-jmeno" name="jmeno" required autoFocus />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-prijmeni" className="text-xs">Příjmení *</Label>
                <Input id="new-prijmeni" name="prijmeni" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="new-telefon" className="text-xs">Telefon *</Label>
                <Input id="new-telefon" name="telefon" required placeholder="+420..." />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-email" className="text-xs">Email *</Label>
                <Input id="new-email" name="email" type="email" required />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setTab("existing")}>Zpět</Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "Vytvářím..." : "Vytvořit a přidat"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
