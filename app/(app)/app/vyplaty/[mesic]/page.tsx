import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Lock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/shared/page-header"
import { getCurrentUserRole } from "@/lib/actions/users"
import { getVyplataMesic } from "@/lib/actions/vyplata"
import { VyplataTabulka } from "@/components/vyplata/vyplata-tabulka"

export const metadata: Metadata = { title: "Výplatní přehled" }

export default async function VyplatyMesicPage({
  params,
}: {
  params: Promise<{ mesic: string }>
}) {
  const { mesic } = await params

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesic)) {
    redirect("/app/vyplaty")
  }

  const role = await getCurrentUserRole()
  if (!role || !["admin", "naborar"].includes(role)) {
    redirect("/app")
  }

  const result = await getVyplataMesic(mesic)
  if ("error" in result) {
    redirect("/app/prehled-mesic")
  }
  const data = result.data

  const mesicLabel = new Date(`${mesic}-01`).toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
  })

  const now = new Date()

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Výplatní přehled — ${mesicLabel}`}
        description={
          data.akce.length === 0
            ? "Žádné proběhlé akce v tomto měsíci."
            : `${data.akce.length} akcí · ${data.dpp.length} DPP · ${data.osvc.length} OSVČ`
        }
        actions={
          <Link href={`/app/prehled-mesic?mesic=${mesic}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Zpět na měsíční přehled
            </Button>
          </Link>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        {[-3, -2, -1, 0].map((offset) => {
          const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
          const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          const label = d.toLocaleDateString("cs-CZ", { month: "short", year: "numeric" })
          return (
            <Link key={val} href={`/app/vyplaty/${val}`}>
              <Badge
                variant={val === mesic ? "default" : "outline"}
                className="cursor-pointer h-8 px-3"
              >
                {label}
              </Badge>
            </Link>
          )
        })}

        {data.uzamceno && (
          <div className="ml-auto">
            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 h-8 px-3">
              <Lock className="h-3 w-3 mr-1.5" />
              Uzamčeno{" "}
              {new Date(data.uzamceno.at).toLocaleDateString("cs-CZ")}
              {data.uzamceno.by &&
                ` — ${data.uzamceno.by.jmeno ?? ""} ${data.uzamceno.by.prijmeni ?? ""}`.trim()}
            </Badge>
          </div>
        )}
      </div>

      {data.akce.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Žádné proběhlé akce za {mesicLabel}.
          </CardContent>
        </Card>
      ) : (
        <VyplataTabulka
          data={data}
          userRole={role as "admin" | "naborar"}
          mesicLabel={mesicLabel}
        />
      )}
    </div>
  )
}
