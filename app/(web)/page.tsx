import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  ArrowRight,
  Users,
  Ticket,
  ShirtIcon,
  Sparkles,
  Shield,
  Trash2,
  Clapperboard,
  HeadphonesIcon,
  CheckCircle,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Crewmate — Tvůj event. Náš team.",
  description: "Profesionální eventový personál pro vaše akce. Vstupy, bary, šatny, hostesky, bezpečnost, úklid, produkce.",
}

const SERVICES = [
  { num: "01", icon: Users, title: "Vstupní servis", desc: "Kontrola vstupenek, registrace hostů, organizace front. Profesionální první dojem pro vaše hosty." },
  { num: "02", icon: HeadphonesIcon, title: "Bary a catering", desc: "Zkušení barmani a barmanky. Rychlá obsluha, mixologie, výčep, catering servis." },
  { num: "03", icon: ShirtIcon, title: "Šatny", desc: "Spolehlivá obsluha šaten na koncertech, konferencích, plésech a firemních akcích." },
  { num: "04", icon: Sparkles, title: "Hostesky a promotéři", desc: "Reprezentativní hostesky pro firemní akce, veletrhy, galavečery a premiéry." },
  { num: "05", icon: Shield, title: "Security", desc: "Bezpečnostní služby, crowd management, kontrola vstupů a ochrana VIP zón." },
  { num: "06", icon: Trash2, title: "Úklid a waste management", desc: "Úklid během i po akcích. Waste management, recyklace, třídění odpadu." },
  { num: "07", icon: Clapperboard, title: "Produkce", desc: "Produkční asistence, stage management, logistika, koordinace dodavatelů." },
  { num: "08", icon: Ticket, title: "Koordinace", desc: "Vedoucí směn a koordinátoři pro velké akce. Komunikace s klientem na místě." },
] as const

const ROLES = ["Vstupy", "Bary", "Šatny", "Hostesky", "Bedňáci", "Security", "Úklid", "Produkce"]

const STEPS = [
  { num: "1", title: "Poptávka", desc: "Řeknete nám co potřebujete — kolik lidí, na jakou pozici, kdy a kde." },
  { num: "2", title: "Návrh týmu", desc: "Během 24 hodin vám navrhneme tým přesně na míru vaší akce." },
  { num: "3", title: "Realizace", desc: "Dodáme sehraný tým včas. Koordinátor na místě řeší vše za vás." },
]

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold text-[#1a1a4e] uppercase tracking-widest mb-4">
                Event Crew Professionals
              </p>
              <h1 className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-6">
                Tvůj<br />event.<br /><em className="text-[#1a1a4e]">Náš<br />team.</em>
              </h1>
              <p className="text-lg text-gray-600 mb-8 max-w-md">
                <strong>Všechny klíčové role na jednom místě.</strong> Funkční, sehrané, připravené týmy — od vstupů až po zázemí.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="#kontakt">
                  <Button size="lg" className="bg-[#1a1a4e] hover:bg-[#2a2a6e] text-white rounded-full px-8 gap-2">
                    Poptejte spolupráci <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="#sluzby">
                  <Button size="lg" variant="outline" className="rounded-full px-8">
                    Co nabízíme
                  </Button>
                </Link>
              </div>
              {/* Stats */}
              <div className="mt-12 pt-8 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">My jako pořadatelé akcí:</p>
                <div className="flex gap-12">
                  <div>
                    <p className="text-4xl font-black">7+</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">let zkušeností</p>
                  </div>
                  <div>
                    <p className="text-4xl font-black">200+</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">akcí ročně</p>
                  </div>
                  <div>
                    <p className="text-4xl font-black">168k+</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">návštěvníků</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative hidden lg:block">
              {/* Photo placeholder — replace with real event photo */}
              <div className="aspect-[4/5] rounded-2xl bg-gradient-to-br from-[#1a1a4e] to-[#3a3a8e] flex items-end justify-center overflow-hidden">
                <div className="bg-[#0f0f2e] p-4 w-full">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Obsazujeme role</p>
                  <div className="flex flex-wrap gap-2">
                    {ROLES.map((role) => (
                      <span key={role} className="text-xs text-white bg-white/10 px-3 py-1.5 rounded-full border border-white/20">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="sluzby" className="py-20 md:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#1a1a4e] uppercase tracking-widest mb-3">Služby</p>
          <h2 className="text-3xl md:text-5xl font-black mb-4">
            Obsadíme každou roli<br />vašeho eventu
          </h2>
          <p className="text-gray-600 mb-12 max-w-lg">
            Kompletní týmy pro akce jakékoliv velikosti.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SERVICES.map((s) => (
              <div key={s.num} className="bg-white rounded-xl p-6 border border-gray-100 hover:border-[#1a1a4e]/20 hover:shadow-lg transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex items-center gap-3">
                    <s.icon className="h-6 w-6 text-[#1a1a4e]" />
                    <span className="text-xs text-gray-400 font-mono">{s.num}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1">{s.title}</h3>
                    <p className="text-sm text-gray-600">{s.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="jak-to-funguje" className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#1a1a4e] uppercase tracking-widest mb-3">Jak to funguje</p>
          <h2 className="text-3xl md:text-5xl font-black mb-12">
            3 kroky ke skvělé akci
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step) => (
              <div key={step.num} className="relative">
                <div className="text-6xl font-black text-gray-100 mb-2">{step.num}</div>
                <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA - Brigády */}
      <section className="py-20 md:py-28 bg-[#1a1a4e] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-5xl font-black mb-4">Hledáte brigádu?</h2>
          <p className="text-lg text-gray-300 mb-8 max-w-lg mx-auto">
            Přidejte se k našemu týmu. Flexibilní brigády na eventových akcích po celé ČR.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mb-8">
            {ROLES.map((role) => (
              <span key={role} className="text-sm bg-white/10 px-4 py-2 rounded-full border border-white/20">
                {role}
              </span>
            ))}
          </div>
          <Link href="/prace">
            <Button size="lg" className="bg-white text-[#1a1a4e] hover:bg-gray-100 rounded-full px-8 gap-2 font-bold">
              Prohlédnout nabídky <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Contact */}
      <section id="kontakt" className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            <div>
              <p className="text-xs font-semibold text-[#1a1a4e] uppercase tracking-widest mb-3">Kontakt</p>
              <h2 className="text-3xl md:text-5xl font-black mb-6">
                Poptejte personál<br />pro vaši akci
              </h2>
              <div className="space-y-4 text-gray-600">
                <p className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" /> Odpovídáme do 24 hodin
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" /> Nezávazná cenová nabídka
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" /> Tým na míru vaší akci
                </p>
              </div>
              <div className="mt-8 space-y-2">
                <p className="text-sm"><strong>Email:</strong> <a href="mailto:team@crewmate.cz" className="text-[#1a1a4e] hover:underline">team@crewmate.cz</a></p>
                <p className="text-sm"><strong>Telefon:</strong> <a href="tel:+420774617955" className="text-[#1a1a4e] hover:underline">+420 774 617 955</a></p>
                <p className="text-sm"><strong>Instagram:</strong> <a href="https://instagram.com/crewmate.cz" className="text-[#1a1a4e] hover:underline">@crewmate.cz</a></p>
              </div>
            </div>
            <div>
              <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
                <h3 className="text-xl font-bold mb-6">Poptávkový formulář</h3>
                <form className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="c-name">Jméno a příjmení *</Label>
                      <Input id="c-name" placeholder="Jan Novák" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-company">Firma</Label>
                      <Input id="c-company" placeholder="Název firmy" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="c-email">Email *</Label>
                      <Input id="c-email" type="email" placeholder="jan@firma.cz" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-phone">Telefon</Label>
                      <Input id="c-phone" placeholder="+420 ..." />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-message">S čím Vám můžeme pomoci? *</Label>
                    <Textarea id="c-message" placeholder="Např.: Festival 3 000 lidí, 15.6. Praha — potřebujeme tým na vstupy a šatnu." rows={4} required />
                  </div>
                  <Button type="submit" size="lg" className="w-full bg-[#1a1a4e] hover:bg-[#2a2a6e] text-white rounded-full">
                    Odeslat poptávku
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
