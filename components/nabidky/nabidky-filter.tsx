"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const FILTERS = [
  { value: "vse", label: "Všechny" },
  { value: "aktivni", label: "Aktivní" },
  { value: "pozastavena", label: "Pozastavené" },
  { value: "ukoncena", label: "Ukončené" },
] as const

export function NabidkyFilter({ currentStav }: { currentStav?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const active = currentStav || "vse"

  function setFilter(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "vse") {
      params.delete("stav")
    } else {
      params.set("stav", value)
    }
    router.push(`/app/nabidky?${params.toString()}`)
  }

  return (
    <div className="flex gap-2 mb-4">
      {FILTERS.map((f) => (
        <Button
          key={f.value}
          variant={active === f.value ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter(f.value)}
          className={cn(active === f.value ? "" : "text-muted-foreground")}
        >
          {f.label}
        </Button>
      ))}
    </div>
  )
}
