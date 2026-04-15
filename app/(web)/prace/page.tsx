import type { Metadata } from "next"
import Link from "next/link"
import { MapPin, Banknote, ArrowRight } from "lucide-react"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Brigády — Crewmate",
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

function extractCities(nabidky: { misto: string | null }[]): string[] {
  const cities = new Set<string>()
  for (const n of nabidky) {
    if (n.misto) {
      // Extract city name — take last part after comma, or full value
      const parts = n.misto.split(",").map(s => s.trim())
      const city = parts[parts.length - 1] ?? n.misto
      if (city) cities.add(city)
    }
  }
  return Array.from(cities).sort()
}

export default async function PracePage({
  searchParams,
}: {
  searchParams: Promise<{ mesto?: string }>
}) {
  const params = await searchParams
  const allNabidky = await getPublicNabidky()
  const cities = extractCities(allNabidky)
  const selectedCity = params.mesto ?? ""

  const nabidky = selectedCity
    ? allNabidky.filter(n => n.misto?.toLowerCase().includes(selectedCity.toLowerCase()))
    : allNabidky

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
      <div className="mb-12">
        <p className="text-xs font-semibold text-[#000066] uppercase tracking-widest mb-3">Brigády</p>
        <h1 className="text-3xl md:text-5xl font-black mb-4">Volné pozice</h1>
        <p className="text-gray-600 text-lg max-w-lg">
          Přidejte se k našemu týmu. Flexibilní brigády na eventových akcích po celé ČR.
        </p>
      </div>

      {cities.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          <Link href="/prace">
            <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer ${
              !selectedCity
                ? "bg-[#000066] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}>
              Celá ČR
            </span>
          </Link>
          {cities.map((city) => (
            <Link key={city} href={`/prace?mesto=${encodeURIComponent(city)}`}>
              <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                selectedCity === city
                  ? "bg-[#000066] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
                {city}
              </span>
            </Link>
          ))}
        </div>
      )}

      {nabidky.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-2xl">
          <p className="text-gray-500 text-lg mb-2">
            Momentálně nemáme žádné otevřené pozice.
          </p>
          <p className="text-gray-400">
            Zkuste to později nebo nám napište na{" "}
            <a href="mailto:team@crewmate.cz" className="text-[#000066] hover:underline font-medium">
              team@crewmate.cz
            </a>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {nabidky.map((n) => (
            <Link key={n.id} href={`/prace/${n.slug}`} className="group block">
              <div className="border border-gray-200 rounded-xl p-6 hover:border-[#000066]/30 hover:shadow-lg transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h2 className="text-xl font-bold group-hover:text-[#000066] transition-colors">{n.nazev}</h2>
                    {n.klient && (
                      <p className="text-sm text-gray-500 mt-0.5">{n.klient}</p>
                    )}
                  </div>
                  <span className="text-xs font-medium text-[#000066] bg-[#000066]/5 px-3 py-1 rounded-full shrink-0">
                    {n.typ === "prubezna" ? "Průběžně" : "Jednorázová"}
                  </span>
                </div>
                {n.popis_prace && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{n.popis_prace}</p>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                    {n.misto && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {n.misto}
                      </span>
                    )}
                    {n.odmena && (
                      <span className="flex items-center gap-1 font-semibold text-gray-700">
                        <Banknote className="h-3.5 w-3.5" /> {n.odmena}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-[#000066] font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Detail <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
