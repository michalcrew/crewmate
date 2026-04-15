import type { Metadata } from "next"
import Link from "next/link"
import { MapPin, Clock, Banknote } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Volné pozice — Crewmate",
  description: "Hledáme brigádníky na eventové akce. Bary, vstupy, šatny, hostesky, bezpečnost, úklid, produkce.",
}

async function getPublicNabidky() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("nabidky")
    .select("id, nazev, typ, klient, typ_pozice, popis_prace, odmena, misto, datum_od, datum_do, slug")
    .eq("zverejnena", true)
    .eq("stav", "aktivni")
    .order("created_at", { ascending: false })

  return data ?? []
}

export default async function PracePage() {
  const nabidky = await getPublicNabidky()

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold mb-4">Volné pozice</h1>
        <p className="text-muted-foreground text-lg">
          Přidejte se k našemu týmu. Flexibilní brigády na eventových akcích.
        </p>
      </div>

      {nabidky.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg mb-2">
            Momentálně nemáme žádné otevřené pozice.
          </p>
          <p className="text-muted-foreground">
            Zkuste to později nebo nám napište na{" "}
            <a href="mailto:team@crewmate.cz" className="text-primary hover:underline">
              team@crewmate.cz
            </a>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {nabidky.map((n) => (
            <Link key={n.id} href={`/prace/${n.slug}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{n.nazev}</CardTitle>
                      {n.klient && (
                        <p className="text-sm text-muted-foreground mt-1">{n.klient}</p>
                      )}
                    </div>
                    <Badge variant="outline">
                      {n.typ === "prubezna" ? "Průběžně" : "Jednorázová"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {n.popis_prace && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {n.popis_prace}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {n.misto && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {n.misto}
                      </span>
                    )}
                    {n.odmena && (
                      <span className="flex items-center gap-1">
                        <Banknote className="h-3.5 w-3.5" /> {n.odmena}
                      </span>
                    )}
                    {n.typ === "prubezna" && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> Průběžný nábor
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
