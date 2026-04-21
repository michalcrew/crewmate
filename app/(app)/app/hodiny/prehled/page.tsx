import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/shared/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { getCurrentUserRole } from "@/lib/actions/users"
import { getHodinyPrehledZakazky } from "@/lib/actions/naborar-hodiny"
import { formatMinutes } from "@/lib/utils/minutes"
import { HodinyPrehledRow } from "@/components/hodiny/hodiny-prehled-row"

export const metadata: Metadata = { title: "Přehled zakázek — hodiny" }

export default async function HodinyPrehledPage({
  searchParams,
}: {
  searchParams: Promise<{ mesic?: string }>
}) {
  const role = await getCurrentUserRole()
  if (role !== "admin") redirect("/app/hodiny")

  const params = await searchParams
  const now = new Date()
  const mesic = params.mesic ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const mesicLabel = new Date(`${mesic}-01`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })

  const rows = await getHodinyPrehledZakazky({ mesic })

  const totalMinut = rows.reduce((s, r) => s + Number(r.celkem_minut || 0), 0)
  const totalNaklad = rows.reduce((s, r) => s + Number(r.naklad_kc || 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Přehled zakázek — hodiny nábor"
        description={`${mesicLabel} — celkem ${formatMinutes(totalMinut)} · ${totalNaklad.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`}
        actions={
          <Link href="/app/hodiny">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Zpět na hodiny
            </Button>
          </Link>
        }
      />

      {/* Month selector */}
      <div className="flex gap-2 flex-wrap">
        {[-3, -2, -1, 0].map((offset) => {
          const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
          const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          const label = d.toLocaleDateString("cs-CZ", { month: "short", year: "numeric" })
          return (
            <Link key={val} href={`/app/hodiny/prehled?mesic=${val}`}>
              <Badge variant={val === mesic ? "default" : "outline"} className="cursor-pointer h-8 px-3">
                {label}
              </Badge>
            </Link>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Žádné záznamy na zakázkách za {mesicLabel}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3">Zakázka</th>
                    <th className="px-4 py-3 text-right">Celkem</th>
                    <th className="px-4 py-3 text-right">Minut</th>
                    <th className="px-4 py-3 text-right">Náklad</th>
                    <th className="px-4 py-3 text-right">Náborářek</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <HodinyPrehledRow key={r.nabidka_id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
