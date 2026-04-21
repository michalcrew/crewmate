"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { deleteHodnoceni } from "@/lib/actions/hodnoceni"
import { StarRating } from "@/components/ui/star-rating"
import { UpravitHodnoceniDialog } from "./upravit-hodnoceni-dialog"
import { toast } from "sonner"

/**
 * F-0016 US-1C-2 — seznam hodnocení (client, list props server-fetched).
 *
 * D-F0016-04 (C): edit/delete smí každý authenticated — UI nefiltruje tlačítka.
 * Pokud `hodnotil_user_id === NULL` (autor smazán), zobrazí „Smazaný uživatel"
 * (ikony zůstávají — D-F0016-05: kdokoli může editovat/mazat).
 */

type Autor = { id: string; jmeno: string; prijmeni: string } | null
type Akce = { id: string; nazev: string; datum: string } | null

export type HodnoceniItem = {
  id: string
  hodnoceni: number
  poznamka: string | null
  akce_id: string | null
  hodnotil_user_id: string | null
  created_at: string
  autor: Autor | Autor[]
  akce: Akce | Akce[]
}

type AkceOpt = { id: string; nazev: string; datum: string }

type Props = {
  items: HodnoceniItem[]
  akceOptions: AkceOpt[]
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export function HodnoceniList({ items, akceOptions }: Props) {
  const [pending, startTransition] = useTransition()

  function onDelete(id: string) {
    if (!confirm("Opravdu smazat hodnocení? Akce je nevratná.")) return
    startTransition(async () => {
      const res = await deleteHodnoceni(id)
      if ("success" in res && res.success) {
        toast.success("Hodnocení smazáno")
      } else if ("error" in res) {
        toast.error(res.error)
      }
    })
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Žádná hodnocení zatím.
      </p>
    )
  }

  return (
    <ul className="divide-y">
      {items.map((h) => {
        const autor = unwrap(h.autor)
        const akce = unwrap(h.akce)
        const autorJmeno = h.hodnotil_user_id && autor
          ? `${autor.jmeno ?? ""} ${autor.prijmeni ?? ""}`.trim()
          : "Smazaný uživatel"

        return (
          <li key={h.id} className="py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <StarRating value={h.hodnoceni} showCount={false} />
                <span className="text-xs text-muted-foreground">• {autorJmeno}</span>
                <span className="text-xs text-muted-foreground">
                  • {new Date(h.created_at).toLocaleDateString("cs-CZ")}
                </span>
                {akce && (
                  <span className="text-xs text-muted-foreground">
                    • {akce.nazev} ({new Date(akce.datum).toLocaleDateString("cs-CZ")})
                  </span>
                )}
              </div>
              {h.poznamka && (
                <p className="text-sm whitespace-pre-wrap">{h.poznamka}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <UpravitHodnoceniDialog
                hodnoceniId={h.id}
                initial={{
                  hodnoceni: h.hodnoceni,
                  poznamka: h.poznamka,
                  akce_id: h.akce_id,
                }}
                akceOptions={akceOptions}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Smazat hodnocení"
                disabled={pending}
                onClick={() => onDelete(h.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
