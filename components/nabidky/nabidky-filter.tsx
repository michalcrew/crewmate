"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const FILTERS = [
  { value: "vse", label: "Všechny" },
  { value: "jednodenni", label: "Jednodenní" },
  { value: "opakovana", label: "Opakované" },
  { value: "ukoncena", label: "Ukončené" },
] as const

export function NabidkyFilter({ currentFilter }: { currentFilter?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const active = currentFilter || "vse"

  function setFilter(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "vse") {
      params.delete("filtr")
    } else {
      params.set("filtr", value)
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
