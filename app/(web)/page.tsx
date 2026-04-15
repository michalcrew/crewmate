import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Crewmate — Eventový personál",
  description: "Profesionální personál pro vaše akce. Bary, vstupy, šatny, hostesky, bezpečnost, úklid, produkce.",
}

export default function HomePage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold mb-4">
        Eventový personál na míru
      </h1>
      <p className="text-lg text-muted-foreground mb-8 max-w-2xl">
        Dodáváme spolehlivé brigádníky pro vaše akce. Bary, vstupy, šatny,
        hostesky, bezpečnost, úklid, produkce.
      </p>
      <p className="text-sm text-muted-foreground">
        Obsah veřejného webu bude přenesen z aktuálního crewmate.cz v E-0003 (F-0020).
      </p>
    </div>
  )
}
