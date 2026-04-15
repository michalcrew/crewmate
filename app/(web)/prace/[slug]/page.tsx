import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { MapPin, Banknote, Users, Calendar, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
      <Link href="/prace" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-8 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Zpět na nabídky
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
        {/* Detail */}
        <div className="lg:col-span-3">
          <div className="mb-2">
            <span className="text-xs font-semibold text-[#000066] uppercase tracking-widest">
              {nabidka.typ === "prubezna" ? "Průběžný nábor" : "Jednorázová akce"}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black mb-3">{nabidka.nazev}</h1>

          {nabidka.klient && (
            <p className="text-gray-500 mb-6">{nabidka.klient}</p>
          )}

          <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-8 pb-8 border-b border-gray-200">
            {nabidka.misto && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-[#000066]" /> {nabidka.misto}
              </span>
            )}
            {nabidka.odmena && (
              <span className="flex items-center gap-1.5 font-semibold text-gray-900">
                <Banknote className="h-4 w-4 text-[#000066]" /> {nabidka.odmena}
              </span>
            )}
            {nabidka.pocet_lidi && (
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-[#000066]" /> {nabidka.pocet_lidi} lidí / směna
              </span>
            )}
            {nabidka.datum_od && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-[#000066]" />
                {new Date(nabidka.datum_od).toLocaleDateString("cs-CZ")}
                {nabidka.datum_do && ` — ${new Date(nabidka.datum_do).toLocaleDateString("cs-CZ")}`}
              </span>
            )}
          </div>

          {nabidka.popis_prace && (
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-3">Popis práce</h2>
              <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{nabidka.popis_prace}</p>
            </div>
          )}

          {nabidka.pozadavky && (
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-3">Požadavky</h2>
              <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{nabidka.pozadavky}</p>
            </div>
          )}
        </div>

        {/* Přihláška (sticky sidebar) */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-24">
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
              <h2 className="text-xl font-bold mb-4">Mám zájem</h2>
              <p className="text-sm text-gray-500 mb-6">
                Vyplňte formulář a my se vám ozveme.
              </p>
              <PrihlaskaForm nabidkaId={nabidka.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
