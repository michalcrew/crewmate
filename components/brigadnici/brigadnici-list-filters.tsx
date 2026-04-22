"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Check, ChevronDown, X } from "lucide-react"
import { DOKUMENTACNI_STAVY, type DokumentacniStav } from "@/components/brigadnici/dokumentacni-stav-badge"

/**
 * F-0016 US-1D-1 + US-1G-1 — list filter toolbar.
 *
 * URL-bound state:
 *  - ?typ=all|brigadnik|osvc     (segmented control)
 *  - ?stav=a,b,c                 (multi-select, comma-sep 6 dokumentačních hodnot)
 *  - ?q=...                      (ponecháno existujícímu BrigadniciSearch)
 */

const STAV_VALUES: DokumentacniStav[] = [
  "nevyplnene_udaje",
  "vyplnene_udaje",
  "poslana_dpp",
  "podepsana_dpp",
  "ukoncena_dpp",
  "osvc",
]

const TYP_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Všichni" },
  { value: "brigadnik", label: "Brigádníci" },
  { value: "osvc", label: "Fakturanti" },
]

export function BrigadniciListFilters() {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [stavOpen, setStavOpen] = useState(false)

  const typ = params.get("typ") ?? "all"
  const stavRaw = params.get("stav") ?? ""
  const selectedStavs = stavRaw ? stavRaw.split(",").filter(Boolean) : []
  const zahrnoutBlokovane = params.get("blokovani") === "1"

  function buildUrl(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    const qs = next.toString()
    return qs ? `?${qs}` : ""
  }

  function setTyp(value: string) {
    startTransition(() => {
      router.push(
        buildUrl((p) => {
          if (value === "all") p.delete("typ")
          else p.set("typ", value)
        })
      )
    })
  }

  function toggleStav(stav: string) {
    const next = selectedStavs.includes(stav)
      ? selectedStavs.filter((s) => s !== stav)
      : [...selectedStavs, stav]
    startTransition(() => {
      router.push(
        buildUrl((p) => {
          if (next.length === 0) p.delete("stav")
          else p.set("stav", next.join(","))
        })
      )
    })
  }

  function toggleBlokovane() {
    startTransition(() => {
      router.push(
        buildUrl((p) => {
          if (zahrnoutBlokovane) p.delete("blokovani")
          else p.set("blokovani", "1")
        })
      )
    })
  }

  function clearAll() {
    startTransition(() => {
      router.push(
        buildUrl((p) => {
          p.delete("typ")
          p.delete("stav")
          p.delete("blokovani")
        })
      )
    })
  }

  const hasFilters = typ !== "all" || selectedStavs.length > 0 || zahrnoutBlokovane

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Segmented typ */}
      <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="Typ brigádníka">
        {TYP_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTyp(opt.value)}
            disabled={pending}
            role="tab"
            aria-selected={typ === opt.value}
            className={`px-3 py-1 text-xs rounded-sm transition-colors ${
              typ === opt.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Multi-select status */}
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setStavOpen((o) => !o)}
          aria-expanded={stavOpen}
          className="h-8 gap-1"
        >
          Stav {selectedStavs.length > 0 && `(${selectedStavs.length})`}
          <ChevronDown className="h-3 w-3" />
        </Button>
        {stavOpen && (
          <div
            className="absolute left-0 top-full mt-1 z-30 min-w-[220px] p-1 border rounded-md bg-popover shadow-lg"
            onMouseLeave={() => setStavOpen(false)}
          >
            {STAV_VALUES.map((sv) => {
              const cfg = DOKUMENTACNI_STAVY[sv]
              const checked = selectedStavs.includes(sv)
              return (
                <button
                  key={sv}
                  type="button"
                  onClick={() => toggleStav(sv)}
                  disabled={pending}
                  className="flex items-center justify-between w-full px-2 py-1.5 text-xs rounded hover:bg-muted"
                >
                  <span>{cfg.label}</span>
                  {checked && <Check className="h-3 w-3" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* F-0021a — toggle blokovaných */}
      <Button
        type="button"
        variant={zahrnoutBlokovane ? "default" : "outline"}
        size="sm"
        onClick={toggleBlokovane}
        disabled={pending}
        className="h-8 text-xs"
        title="Výchozí: blokovaní brigádníci jsou skryti"
      >
        {zahrnoutBlokovane ? "Zobrazuji i blokované" : "Skrýt blokované"}
      </Button>

      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="h-8 text-xs"
        >
          <X className="h-3 w-3 mr-1" />
          Vymazat
        </Button>
      )}
    </div>
  )
}
