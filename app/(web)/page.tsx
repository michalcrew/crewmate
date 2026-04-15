import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { KontaktForm } from "@/components/web/kontakt-form"
import {
  ArrowRight, Users, Ticket, ShirtIcon, Sparkles, Shield,
  Trash2, Clapperboard, HeadphonesIcon, CheckCircle,
  Zap, Database, UserCheck, Award, Clock, Banknote, PartyPopper,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Crewmate — Tvůj event. Náš team.",
  description: "Profesionální eventový personál. Vstupy, bary, šatny, hostesky, bezpečnost, úklid, produkce.",
}

const ROLES = ["Vstupy", "Bary", "Šatny", "Hostesky", "Bedňáci", "Security", "Úklid", "Produkce"]

const SERVICES = [
  {
    num: "01", title: "Zajištění týmů na eventy",
    desc: "Vstupy, šatny, hostesky, promo týmy, bezpečnost, úklid.",
    tags: ["Vstupy", "Šatny", "Hostesky", "Security", "Úklid"],
  },
  {
    num: "02", title: "Bary & obsluha",
    desc: "Kompletní bar od základů, nebo sehraný tým barmanů a obsluhy.",
    tags: ["Barmani", "Debaras", "Sestavení baru", "Gastro"],
  },
  {
    num: "03", title: "Podpůrné služby",
    desc: "Produkční týmy, nastavení procesů, koordinace a řízení na místě.",
    tags: ["Produkce", "Koordinace", "Procesy"],
  },
  {
    num: "04", title: "Doplňkové služby",
    desc: "Grafika, web, foto/video, marketing a celková realizace eventu.",
    tags: ["Grafika", "Marketing", "Foto/video"],
  },
]

const HOW_WE_WORK = [
  { icon: Users, title: "Sestavení týmu", desc: "Poskládáme tým přesně podle potřeb eventu." },
  { icon: Zap, title: "Systém", desc: "Každý člen prochází výběrem a školením." },
  { icon: Database, title: "Databáze", desc: "Rozsáhlá základna lidí. Last minute? Není problém." },
  { icon: UserCheck, title: "Bez starostí", desc: "Převezmeme vedení, komunikaci a dohled." },
]

const COOPERATION_STEPS = [
  { num: "01", title: "Úvodní konzultace", desc: "Projdeme váš event a specifické potřeby." },
  { num: "02", title: "Návrh řešení", desc: "Konkrétní plán a obsazení jednotlivých pozic." },
  { num: "03", title: "Realizace", desc: "Týmy přicházejí připravené a koordinované." },
  { num: "04", title: "Vyhodnocení", desc: "Výsledky a nastavení další spolupráce." },
]

const CASE_STUDIES = [
  {
    title: "SIGNAL Festival 2025",
    desc: "Převzali jsme odbavení návštěvníků všech placených instalací SIGNAL INSIDE vč. řízení front, komunikativní navigátory a zkušené koordinátory.",
    stats: ["10 000+ odbavených návštěvníků", "Plynulý provoz po celou dobu festivalu", "Řízení front a navigace návštěvníků", "Jasná koordinace mezi týmy a produkcí"],
  },
  {
    title: "Multi-city festival",
    desc: "Již 4 roky organizujeme multi-city festival The Culture napříč ČR.",
    stats: ["20 000+ účastníků ročně"],
  },
  {
    title: "Největší studentská agentura v ČR",
    desc: "Spravujeme největší studentskou agenturu v České republice.",
    stats: ["144 akcí v 10 městech ročně"],
  },
]

const BRIGADE_BENEFITS = [
  { icon: Clock, title: "Flexibilní brigády", desc: "Sám si vybíráš, na které eventy jdeš." },
  { icon: CheckCircle, title: "Vždy víš, na čem jsi", desc: "Podmínky znáš vždy předem." },
  { icon: Banknote, title: "Výplata v termínu", desc: "Transparentní sazby a spolehlivá výplata." },
  { icon: PartyPopper, title: "Práce + zážitek", desc: "Pracuješ na místě, kde se něco děje." },
]

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold text-[#000066] uppercase tracking-widest mb-4">Event Crew Professionals</p>
              <h1 className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-6">
                Tvůj<br />event.<br /><em className="text-[#000066]">Náš<br />team.</em>
              </h1>
              <p className="text-lg text-gray-600 mb-8 max-w-md">
                <strong>Všechny klíčové role na jednom místě.</strong> Funkční, sehrané, připravené týmy — od vstupů až po zázemí.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="#kontakt">
                  <Button size="lg" className="bg-[#000066] hover:bg-[#1a1a7e] text-white rounded-full px-8 gap-2">
                    Poptejte spolupráci <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="#sluzby">
                  <Button size="lg" variant="outline" className="rounded-full px-8">Co nabízíme</Button>
                </Link>
              </div>
              <div className="mt-12 pt-8 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">My jako pořadatelé akcí:</p>
                <div className="flex gap-8 sm:gap-12">
                  <div><p className="text-3xl sm:text-4xl font-black">7+</p><p className="text-xs text-gray-500 uppercase tracking-wide">Let zkušeností</p></div>
                  <div><p className="text-3xl sm:text-4xl font-black">200+</p><p className="text-xs text-gray-500 uppercase tracking-wide">Akcí ročně</p></div>
                  <div><p className="text-3xl sm:text-4xl font-black">168k+</p><p className="text-xs text-gray-500 uppercase tracking-wide">Návštěvníků</p></div>
                </div>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="aspect-[4/5] rounded-2xl overflow-hidden relative">
                <Image
                  src="/images/events/event-1.jpg"
                  alt="Crewmate eventový personál"
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 1024px) 0vw, 50vw"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-[#000044]/90 backdrop-blur-sm p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Obsazujeme role</p>
                  <div className="flex flex-wrap gap-2">
                    {ROLES.map((role) => (
                      <span key={role} className="text-xs text-white bg-white/10 px-3 py-1.5 rounded-full border border-white/20">{role}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Služby */}
      <section id="sluzby" className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#000066] uppercase tracking-widest mb-3">Služby</p>
          <h2 className="text-3xl md:text-5xl font-black mb-4">Obsadíme každou roli<br className="hidden sm:block" />vašeho eventu</h2>
          <p className="text-gray-600 mb-12 max-w-lg">Kompletní týmy pro akce jakékoliv velikosti.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SERVICES.map((s, i) => {
              const icons = [Users, HeadphonesIcon, Clapperboard, Sparkles]
              const Icon = icons[i] ?? Users
              return (
              <div key={s.num} className="bg-white rounded-xl p-8 border border-gray-100 hover:border-[#000066]/20 hover:shadow-lg transition-all">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-12 w-12 rounded-full bg-[#000066]/5 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-[#000066]" />
                  </div>
                  <span className="text-sm text-gray-400 font-mono">{s.num}</span>
                </div>
                <h3 className="font-bold text-xl mb-2">{s.title}</h3>
                <p className="text-sm text-gray-600 mb-4">{s.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {s.tags.map((t) => (
                    <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Jak pracujeme */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#000066] uppercase tracking-widest mb-3">Jak pracujeme</p>
          <h2 className="text-3xl md:text-5xl font-black mb-6">Stavíme funkční týmy</h2>
          <p className="text-gray-600 mb-12 max-w-lg">Jsme partner, který staví funkční týmy pro vaše akce.</p>

          {/* Photo grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
            <div className="md:col-span-2 aspect-[16/10] rounded-xl overflow-hidden relative">
              <Image src="/images/events/signal-1.jpg" alt="Crewmate na SIGNAL festivalu" fill className="object-cover" sizes="(max-width: 768px) 100vw, 66vw" />
            </div>
            <div className="grid grid-rows-2 gap-4">
              <div className="aspect-[16/10] rounded-xl overflow-hidden relative">
                <Image src="/images/events/event-2.jpg" alt="Crewmate barman" fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
              </div>
              <div className="aspect-[16/10] rounded-xl overflow-hidden relative">
                <Image src="/images/events/event-3.jpg" alt="Crewmate tým" fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_WE_WORK.map((item) => (
              <div key={item.title} className="border border-gray-200 rounded-xl p-6">
                <h3 className="font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Spolupráce — 4 kroky */}
      <section id="jak-to-funguje" className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#000066] uppercase tracking-widest mb-3">Spolupráce</p>
          <h2 className="text-3xl md:text-5xl font-black mb-12">Jak probíhá spolupráce?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {COOPERATION_STEPS.map((step) => (
              <div key={step.num}>
                <div className="text-5xl font-black text-gray-100 mb-2">{step.num}</div>
                <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                <p className="text-gray-600 text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <Link href="#kontakt">
              <Button size="lg" className="bg-[#000066] hover:bg-[#1a1a7e] text-white rounded-full px-8 gap-2">
                Začněte úvodní konzultací <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Zkušenosti / Case Studies */}
      <section id="zkusenosti" className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#000066] uppercase tracking-widest mb-3">Co jsme zvládli</p>
          <h2 className="text-3xl md:text-5xl font-black mb-12">Zkušenosti</h2>

          {/* Photo strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-8 rounded-xl overflow-hidden">
            <div className="aspect-[4/3] relative"><Image src="/images/events/signal-1.jpg" alt="" fill className="object-cover" sizes="25vw" /></div>
            <div className="aspect-[4/3] relative"><Image src="/images/events/signal-2.jpg" alt="" fill className="object-cover" sizes="25vw" /></div>
            <div className="aspect-[4/3] relative"><Image src="/images/events/signal-3.jpg" alt="" fill className="object-cover" sizes="25vw" /></div>
            <div className="aspect-[4/3] relative"><Image src="/images/events/signal-4.jpg" alt="" fill className="object-cover" sizes="25vw" /></div>
          </div>

          {/* SIGNAL case study — navy bg */}
          <div className="bg-[#000066] text-white rounded-xl p-8 md:p-12 mb-8">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Case Study</span>
            <h3 className="text-2xl md:text-3xl font-black mt-2 mb-4">SIGNAL Festival 2025</h3>
            <p className="text-gray-300 mb-8 max-w-2xl">{CASE_STUDIES[0]?.desc}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {CASE_STUDIES[0]?.stats.map((stat) => (
                <div key={stat} className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                  <span className="text-sm">{stat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Other case studies */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CASE_STUDIES.slice(1).map((cs) => {
              const mainStat = cs.stats[0] ?? ""
              const [num, ...rest] = mainStat.split(" ")
              return (
              <div key={cs.title} className="bg-white rounded-xl p-8 border border-gray-200">
                <h3 className="text-xl font-bold mb-2">{cs.title}</h3>
                <p className="text-sm text-gray-600 mb-6">{cs.desc}</p>
                <div>
                  <span className="text-3xl md:text-4xl font-black">{num}</span>
                  <span className="text-sm text-gray-500 ml-2">{rest.join(" ")}</span>
                </div>
              </div>
              )
            })}
          </div>
          <div className="mt-16 pt-16 border-t border-gray-200 text-center">
            <h3 className="text-2xl font-bold mb-2">Spolehliví partneři</h3>
            <p className="text-gray-500 mb-8">Protože být expertem na vše nejde.</p>
            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 opacity-60">
              <img src="/images/partners/anybar.svg" alt="AnyBar" className="h-8 grayscale" style={{ filter: "brightness(0) invert(0.2)" }} />
              <img src="/images/partners/partner-1.png" alt="Partner" className="h-10 grayscale" style={{ filter: "brightness(0) invert(0.2)" }} />
              <img src="/images/partners/uklidovi-hrdinove.jpg" alt="Úklidoví hrdinové" className="h-10 grayscale rounded" style={{ filter: "brightness(0) invert(0.2)" }} />
            </div>
          </div>
        </div>
      </section>

      {/* Pro uchazeče — Brigády */}
      <section id="brigady" className="py-16 md:py-24 bg-[#000066] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Pro uchazeče</p>
              <h2 className="text-3xl md:text-5xl font-black mb-4">Pracuj s námi</h2>
              <p className="text-gray-300 mb-8 max-w-md">
                Hledáme spolehlivé lidi pro zajímavé akce. Flexibilně, podle svého.
              </p>
              <Link href="/prace">
                <Button size="lg" className="bg-white text-[#000066] hover:bg-gray-100 rounded-full px-8 gap-2 font-bold">
                  Chci brigádu <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {BRIGADE_BENEFITS.map((b) => (
                <div key={b.title} className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <b.icon className="h-5 w-5 text-white/70 mb-2" />
                  <h3 className="font-bold text-sm mb-1">{b.title}</h3>
                  <p className="text-xs text-gray-400">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Kontakt + Poptávka */}
      <section id="kontakt" className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            <div>
              <p className="text-xs font-semibold text-[#000066] uppercase tracking-widest mb-3">Kontakt</p>
              <h2 className="text-3xl md:text-5xl font-black mb-6">Poptejte spolupráci</h2>
              <p className="text-gray-600 mb-8">Rádi si o eventu promluvíme. Popište nám stručně akci a my se ozveme do 24 hodin s nezávazným návrhem řešení.</p>
              <div className="space-y-3 text-sm">
                <p><strong>Email:</strong> <a href="mailto:team@crewmate.cz" className="text-[#000066] hover:underline">team@crewmate.cz</a></p>
                <p><strong>Infolinka:</strong> <a href="tel:+420774617955" className="text-[#000066] hover:underline">+420 774 617 955</a></p>
                <p><strong>Instagram:</strong> <a href="https://instagram.com/crewmate.cz" className="text-[#000066] hover:underline">@crewmate.cz</a></p>
              </div>
            </div>
            <div>
              <KontaktForm />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
