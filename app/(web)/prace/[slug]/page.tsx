import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { MapPin, Banknote, Users, Calendar } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/server"
import { PrihlaskaForm } from "@/components/web/prihlaska-form"

async function getNabidkaBySlug(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("nabidky")
    .select("*")
    .eq("slug", slug)
    .eq("zverejnena", true)
    .eq("stav", "aktivni")
    .single()
  return data
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const nabidka = await getNabidkaBySlug(slug)
  return {
    title: nabidka ? `${nabidka.nazev} — Crewmate` : "Pozice — Crewmate",
    description: nabidka?.popis_prace ?? "Brigáda na eventových akcích",
  }
}

export default async function NabidkaPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const nabidka = await getNabidkaBySlug(slug)
  if (!nabidka) notFound()

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <div className="flex items-start gap-3 mb-3">
          <h1 className="text-3xl font-bold">{nabidka.nazev}</h1>
          <Badge variant="outline" className="mt-1">
            {nabidka.typ === "prubezna" ? "Průběžně" : "Jednorázová"}
          </Badge>
        </div>

        {nabidka.klient && (
          <p className="text-muted-foreground mb-4">{nabidka.klient}</p>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-6">
          {nabidka.misto && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {nabidka.misto}
            </span>
          )}
          {nabidka.odmena && (
            <span className="flex items-center gap-1.5">
              <Banknote className="h-4 w-4" /> {nabidka.odmena}
            </span>
          )}
          {nabidka.pocet_lidi && (
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {nabidka.pocet_lidi} lidí / směna
            </span>
          )}
          {nabidka.datum_od && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {new Date(nabidka.datum_od).toLocaleDateString("cs-CZ")}
              {nabidka.datum_do && ` — ${new Date(nabidka.datum_do).toLocaleDateString("cs-CZ")}`}
            </span>
          )}
        </div>

        {nabidka.popis_prace && (
          <div className="mb-6">
            <h2 className="font-semibold mb-2">Popis práce</h2>
            <p className="text-muted-foreground whitespace-pre-wrap">{nabidka.popis_prace}</p>
          </div>
        )}

        {nabidka.pozadavky && (
          <div className="mb-8">
            <h2 className="font-semibold mb-2">Požadavky</h2>
            <p className="text-muted-foreground whitespace-pre-wrap">{nabidka.pozadavky}</p>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-8">
        <h2 className="text-2xl font-bold mb-6">Přihlášení</h2>
        <PrihlaskaForm nabidkaId={nabidka.id} />
      </div>
    </div>
  )
}
