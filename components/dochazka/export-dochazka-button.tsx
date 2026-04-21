"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function currentMonthYYYYMM(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

type Props = {
  className?: string
  defaultMesic?: string
}

/**
 * F-0018 — XLSX export button. Respektuje per-request role check
 * uvnitř /api/export/dochazka (401/403 returnuje endpoint, UI jen zobrazí toast).
 */
export function ExportDochazkaButton({ className, defaultMesic }: Props) {
  const [mesic, setMesic] = useState(defaultMesic ?? currentMonthYYYYMM())

  const href = mesic ? `/api/export/dochazka?mesic=${mesic}` : `/api/export/dochazka`

  return (
    <div className={`flex items-end gap-2 ${className ?? ""}`}>
      <div className="space-y-1">
        <Label htmlFor="export-mesic" className="text-xs">
          Měsíc
        </Label>
        <Input
          id="export-mesic"
          type="month"
          value={mesic}
          onChange={(e) => setMesic(e.target.value)}
          className="h-10 w-[160px]"
        />
      </div>
      <a
        href={href}
        download
        className={buttonVariants({ variant: "outline" }) + " h-10 px-3"}
      >
        <Download className="w-4 h-4 mr-1" />
        Exportovat XLSX
      </a>
    </div>
  )
}
