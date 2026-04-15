import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Users, Ticket, ShirtIcon, Sparkles, Shield, Trash2, Clapperboard, HeadphonesIcon } from "lucide-react"

export const metadata: Metadata = {
  title: "Crewmate — Eventový personál",
  description: "Profesionální personál pro vaše akce. Bary, vstupy, šatny, hostesky, bezpečnost, úklid, produkce.",
}

const SERVICES = [
  { icon: HeadphonesIcon, title: "Bary", description: "Profesionální barmani a barmanky pro vaše akce" },
  { icon: Ticket, title: "Vstupy", description: "Kontrola vstupenek, registrace hostů, organizace front" },
  { icon: ShirtIcon, title: "Šatny", description: "Obsluha šaten na koncertech, konferencích a plésech" },
  { icon: Sparkles, title: "Hostesky", description: "Reprezentativní hostesky pro firemní akce a veletrhy" },
  { icon: Shield, title: "Bezpečnost", description: "Bezpečnostní služby a crowd management" },
  { icon: Trash2, title: "Úklid", description: "Úklid během i po akcích, waste management" },
  { icon: Clapperboard, title: "Produkce", description: "Produkční asistence, stage management, logistika" },
  { icon: Users, title: "Koordinace", description: "Vedoucí směn a koordinátoři pro velké akce" },
] as const

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-20 md:py-32 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Eventový personál na míru
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Dodáváme spolehlivé brigádníky pro vaše akce. Bary, vstupy, šatny, hostesky, bezpečnost, úklid, produkce.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/prace">
              <Button size="lg">Volné pozice</Button>
            </Link>
            <Link href="#kontakt">
              <Button size="lg" variant="outline">Kontakt</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16 px-4 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            Naše služby
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {SERVICES.map((service) => (
              <div
                key={service.title}
                className="border border-border rounded-lg p-6 hover:border-primary/50 transition-colors"
              >
                <service.icon className="h-8 w-8 text-primary mb-3" />
                <h3 className="font-semibold mb-2">{service.title}</h3>
                <p className="text-sm text-muted-foreground">{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Hledáte brigádu?
          </h2>
          <p className="text-muted-foreground mb-6">
            Přidejte se k našemu týmu. Nabízíme flexibilní brigády na eventových akcích po celé ČR.
          </p>
          <Link href="/prace">
            <Button size="lg">Prohlédnout nabídky</Button>
          </Link>
        </div>
      </section>

      {/* Contact */}
      <section id="kontakt" className="py-16 px-4 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">Kontakt</h2>
          <div className="space-y-2 text-muted-foreground">
            <p className="font-medium text-foreground">Crewmate, s.r.o.</p>
            <p>IČO: 23782587</p>
            <p>
              <a href="mailto:team@crewmate.cz" className="text-primary hover:underline">
                team@crewmate.cz
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
