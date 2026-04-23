"use client"

import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, Star } from "lucide-react"
import { toast } from "sonner"
import { StarRating } from "@/components/ui/star-rating"
import { UpravitHodnoceniDialog } from "./upravit-hodnoceni-dialog"
import { PridatHodnoceniDialog } from "./pridat-hodnoceni-dialog"
import { deleteHodnoceni } from "@/lib/actions/hodnoceni"
import type { HodnoceniItem } from "./hodnoceni-list"

type HistorieItem = {
  id: string
  created_at: string
  typ: string | null
  popis: string | null
}

type AkceOpt = { id: string; nazev: string; datum: string }

type Props = {
  brigadnikId: string
  historie: HistorieItem[]
  hodnoceni: HodnoceniItem[]
  akceOptions: AkceOpt[]
}

type Filter = "all" | "rated" | "unrated"

type MergedEntry =
  | { kind: "hodnoceni"; createdAt: string; data: HodnoceniItem }
  | { kind: "historie"; createdAt: string; data: HistorieItem }

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/**
 * Sloučený timeline: historie (system events) + hodnocení (manual ratings).
 *
 * Řazení: DESC podle created_at. Filter: All / Jen hodnocení / Bez hodnocení.
 *
 * Rule: hodnocení je validní v rozsahu 1-5 hvězd. Pokud row nemá hodnocení
 * (je to historie event), zobrazí se jako 'bez hodnocení' badge. NULL není
 * totéž co 0 hvězd — NULL se nezapočítává do průměru.
 */
export function HistorieHodnoceniTimeline({
  brigadnikId,
  historie,
  hodnoceni,
  akceOptions,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all")
  const [pending, startTransition] = useTransition()

  const { avg, count, merged } = useMemo(() => {
    // Průměr jen z validních hodnocení (1-5)
    const validRatings = hodnoceni.filter(h => h.hodnoceni >= 1 && h.hodnoceni <= 5)
    const sum = validRatings.reduce((acc, h) => acc + h.hodnoceni, 0)
    const count = validRatings.length
    const avg = count > 0 ? sum / count : 0

    const merged: MergedEntry[] = [
      ...hodnoceni.map<MergedEntry>(h => ({ kind: "hodnoceni", createdAt: h.created_at, data: h })),
      ...historie.map<MergedEntry>(h => ({ kind: "historie", createdAt: h.created_at, data: h })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return { avg, count, merged }
  }, [hodnoceni, historie])

  const filtered = useMemo(() => {
    if (filter === "all") return merged
    if (filter === "rated") return merged.filter(e => e.kind === "hodnoceni")
    return merged.filter(e => e.kind === "historie")
  }, [filter, merged])

  function handleDelete(id: string) {
    if (!confirm("Opravdu smazat hodnocení? Akce je nevratná.")) return
    startTransition(async () => {
      const res = await deleteHodnoceni(id)
      if ("success" in res && res.success) toast.success("Hodnocení smazáno")
      else if ("error" in res) toast.error(res.error)
    })
  }

  return (
    <div className="space-y-4">
      {/* Summary — průměr + počet hodnocení */}
      <div className="rounded-lg border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {count > 0 ? (
            <>
              <StarRating value={avg} count={count} />
              <span className="text-sm text-muted-foreground">
                průměr z {count} {count === 1 ? "hodnocení" : count < 5 ? "hodnocení" : "hodnocení"}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <Star className="h-4 w-4 text-muted-foreground" />
              Brigádník zatím nemá žádné hodnocení.
            </span>
          )}
        </div>
        <PridatHodnoceniDialog brigadnikId={brigadnikId} akceOptions={akceOptions} />
      </div>

      {/* Filtry */}
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filtr záznamů">
        {[
          { value: "all", label: "Vše", count: merged.length },
          { value: "rated", label: "Jen hodnocení", count: hodnoceni.length },
          { value: "unrated", label: "Bez hodnocení", count: historie.length },
        ].map(chip => {
          const active = filter === chip.value
          return (
            <button
              key={chip.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(chip.value as Filter)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                active
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {chip.label} <span className="tabular-nums opacity-60">({chip.count})</span>
            </button>
          )
        })}
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          {filter === "rated" ? "Žádná hodnocení." : filter === "unrated" ? "Žádná historie." : "Žádné záznamy."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(entry =>
            entry.kind === "hodnoceni" ? (
              <HodnoceniRow key={`h:${entry.data.id}`} item={entry.data} akceOptions={akceOptions} onDelete={handleDelete} pending={pending} />
            ) : (
              <HistorieRow key={`e:${entry.data.id}`} item={entry.data} />
            ),
          )}
        </ul>
      )}
    </div>
  )
}

function HodnoceniRow({
  item,
  akceOptions,
  onDelete,
  pending,
}: {
  item: HodnoceniItem
  akceOptions: AkceOpt[]
  onDelete: (id: string) => void
  pending: boolean
}) {
  const autor = unwrap(item.autor)
  const akce = unwrap(item.akce)
  const autorJmeno =
    item.hodnotil_user_id && autor
      ? `${autor.jmeno ?? ""} ${autor.prijmeni ?? ""}`.trim()
      : "Smazaný uživatel"

  return (
    <li className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-3">
      <div className="shrink-0 pt-0.5">
        <StarRating value={item.hodnoceni} showCount={false} />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <span>{autorJmeno}</span>
          <span>•</span>
          <span>{new Date(item.created_at).toLocaleString("cs-CZ")}</span>
          {akce && (
            <>
              <span>•</span>
              <span>
                {akce.nazev} ({new Date(akce.datum).toLocaleDateString("cs-CZ")})
              </span>
            </>
          )}
        </div>
        {item.poznamka && <p className="text-sm whitespace-pre-wrap">{item.poznamka}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <UpravitHodnoceniDialog
          hodnoceniId={item.id}
          initial={{ hodnoceni: item.hodnoceni, poznamka: item.poznamka, akce_id: item.akce_id }}
          akceOptions={akceOptions}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Smazat hodnocení"
          disabled={pending}
          onClick={() => onDelete(item.id)}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </li>
  )
}

function HistorieRow({ item }: { item: HistorieItem }) {
  return (
    <li className="flex items-start gap-3 pl-3 py-2 border-l-2 border-muted">
      <Badge variant="outline" className="text-[10px] shrink-0 h-5">
        bez hodnocení
      </Badge>
      <div className="flex-1 min-w-0 text-sm">
        <p>{item.popis}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(item.created_at).toLocaleString("cs-CZ")}
        </p>
      </div>
    </li>
  )
}
