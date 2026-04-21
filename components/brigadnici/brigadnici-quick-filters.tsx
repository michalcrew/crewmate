"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import {
  ALERT_FILTER_KEYS,
  FILTER_KEY_LABELS,
  type AlertFilterKey,
} from "@/lib/actions/dashboard-filters"
import { cn } from "@/lib/utils"

/**
 * F-0017 US-1B-1 — segmented chips pro rychlé preset filtry.
 *
 * URL query param `?filter=bez_dpp|bez_prohlaseni|bez_dotazniku|osvc_bez_ico`.
 * Koexistuje s existujícími `?q=&typ=&stav=` (AND sémantika, BE-side v getBrigadnici).
 */

const CHIPS: { value: AlertFilterKey | "all"; label: string }[] = [
  { value: "all", label: "Všichni" },
  ...ALERT_FILTER_KEYS.map((k) => ({ value: k, label: FILTER_KEY_LABELS[k] })),
]

export function BrigadniciQuickFilters() {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const current = params.get("filter") ?? "all"

  function setFilter(value: AlertFilterKey | "all") {
    startTransition(() => {
      const next = new URLSearchParams(params.toString())
      if (value === "all") next.delete("filter")
      else next.set("filter", value)
      const qs = next.toString()
      router.push(qs ? `?${qs}` : "?")
    })
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label="Rychlé filtry"
    >
      {CHIPS.map((chip) => {
        const active = current === chip.value
        return (
          <button
            key={chip.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setFilter(chip.value)}
            disabled={pending}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
              active
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              pending && "opacity-60"
            )}
          >
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}
