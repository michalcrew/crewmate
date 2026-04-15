"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

export function BrigadniciSearch() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get("q") ?? "")
  const [isPending, startTransition] = useTransition()

  function handleSearch(value: string) {
    setQuery(value)
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set("q", value)
      } else {
        params.delete("q")
      }
      router.push(`/app/brigadnici?${params.toString()}`)
    })
  }

  return (
    <div className="relative mb-4 max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Hledat jméno, email, telefon..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        className="pl-9"
      />
      {isPending && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          ...
        </span>
      )}
    </div>
  )
}
