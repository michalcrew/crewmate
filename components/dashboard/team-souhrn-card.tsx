import Link from "next/link"
import { Users, Calendar, FileText, ClipboardList, UserPlus } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { TeamSouhrn } from "@/lib/actions/dashboard"

/**
 * F-0017 US-1C — admin-only 4-KPI tile grid.
 *
 * Každá tile má velké číslo + label + ikona; klik → filtrovaný pohled.
 * Layout: 2-col na mobile, 4-col na md.
 */

interface Props {
  data: TeamSouhrn
  className?: string
}

interface Tile {
  label: string
  value: number
  icon: LucideIcon
  href: string
  accent?: "normal" | "warn"
}

export function TeamSouhrnCard({ data, className }: Props) {
  const tiles: Tile[] = [
    {
      label: "Zájemci v databázi",
      value: data.zajemciVDatabazi,
      icon: UserPlus,
      href: "/app/brigadnici",
    },
    {
      label: "Aktivní brigádníci",
      value: data.aktivniBrigadnici,
      icon: Users,
      href: "/app/brigadnici",
    },
    {
      label: "Akce tento týden",
      value: data.akceTentoTyden,
      icon: Calendar,
      href: "/app/akce",
    },
    {
      label: "Bez DPP",
      value: data.bezDpp,
      icon: FileText,
      href: "/app/brigadnici?filter=bez_dpp",
      accent: data.bezDpp > 0 ? "warn" : "normal",
    },
    {
      label: "Bez dotazníku",
      value: data.bezDotazniku,
      icon: ClipboardList,
      href: "/app/brigadnici?filter=bez_dotazniku",
      accent: data.bezDotazniku > 0 ? "warn" : "normal",
    },
  ]

  return (
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="pb-3">
        <CardTitle>Team souhrn</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {tiles.map((t) => {
            const Icon = t.icon
            return (
              <Link
                key={t.label}
                href={t.href}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-3 transition-colors hover:bg-muted",
                  t.accent === "warn" && "border-amber-300 bg-amber-50/50 hover:bg-amber-50"
                )}
              >
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-xs">{t.label}</span>
                </div>
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums tracking-tight",
                    t.accent === "warn" && "text-amber-700"
                  )}
                >
                  {t.value}
                </p>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
