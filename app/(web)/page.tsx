import type { Metadata } from "next"
import Link from "next/link"
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
              <p className="text-xs font-semibold text-[#1a1a4e] uppercase tracking-widest mb-4">Event Crew Professionals</p>
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
              <div className="aspect-[4/5] rounded-2xl bg-gradient-to-br from-[#1a1a4e] to-[#3a3a8e] flex items-end overflow-hidden">
                <div className="bg-[#0f0f2e] p-4 w-full">
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
          <p className="text-xs font-semibold text-[#1a1a4e] uppercase tracking-widest mb-3">Služby</p>
          <h2 className="text-3xl md:text-5xl font-black mb-4">Obsadíme každou roli<br className="hidden sm:block" />vašeho eventu</h2>
          <p className="text-gray-600 mb-12 max-w-lg">Kompletní týmy pro akce jakékoliv velikosti.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SERVICES.map((s) => (
              <div key={s.num} className="bg-white rounded-xl p-6 border border-gray-100 hover:border-[#1a1a4e]/20 hover:shadow-lg transition-all">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-xs text-gray-400 font-mono mt-1">{s.num}</span>
                  <div>
                    <h3 className="font-bold text-lg mb-1">{s.title}</h3>
                    <p className="text-sm text-gray-600 mb-3">{s.desc}</p>
                    <div className="flex flex-wrap gap-2">
                      {s.tags.map((t) => (
                        <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Jak pracujeme */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#1a1a4e] uppercase tracking-widest mb-3">Jak pracujeme</p>
          <h2 className="text-3xl md:text-5xl font-black mb-12">Stavíme funkční týmy</h2>
          <p className="text-gray-600 mb-12 max-w-lg">Jsme partner, který staví funkční týmy pro vaše akce.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_WE_WORK.map((item) => (
              <div key={item.title} className="text-center">
                <item.icon className="h-8 w-8 text-[#1a1a4e] mx-auto mb-3" />
                <h3 className="font-bold mb-1">{item.title}</h3>
                <p className="text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Spolupráce — 4 kroky */}
      <section id="jak-to-funguje" className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#1a1a4e] uppercase tracking-widest mb-3">Spolupráce</p>
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
              <Button size="lg" className="bg-[#1a1a4e] hover:bg-[#2a2a6e] text-white rounded-full px-8 gap-2">
                Začněte úvodní konzultací <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Zkušenosti / Case Studies */}
      <section id="zkusenosti" className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#1a1a4e] uppercase tracking-widest mb-3">Co jsme zvládli</p>
          <h2 className="text-3xl md:text-5xl font-black mb-12">Zkušenosti</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {CASE_STUDIES.map((cs) => (
              <div key={cs.title} className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                <span className="text-xs font-semibold text-[#1a1a4e] uppercase tracking-widest">Case Study</span>
                <h3 className="text-xl font-bold mt-2 mb-3">{cs.title}</h3>
                <p className="text-sm text-gray-600 mb-4">{cs.desc}</p>
                <ul className="space-y-2">
                  {cs.stats.map((stat) => (
                    <li key={stat} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <span>{stat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">Spolehliví partneři — protože být expertem na vše nejde.</p>
          </div>
        </div>
      </section>

      {/* Pro uchazeče — Brigády */}
      <section id="brigady" className="py-16 md:py-24 bg-[#1a1a4e] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Pro uchazeče</p>
              <h2 className="text-3xl md:text-5xl font-black mb-4">Pracuj s námi</h2>
              <p className="text-gray-300 mb-8 max-w-md">
                Hledáme spolehlivé lidi pro zajímavé akce. Flexibilně, podle svého.
              </p>
              <Link href="/prace">
                <Button size="lg" className="bg-white text-[#1a1a4e] hover:bg-gray-100 rounded-full px-8 gap-2 font-bold">
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
              <p className="text-xs font-semibold text-[#1a1a4e] uppercase tracking-widest mb-3">Kontakt</p>
              <h2 className="text-3xl md:text-5xl font-black mb-6">Poptejte spolupráci</h2>
              <p className="text-gray-600 mb-8">Rádi si o eventu promluvíme. Popište nám stručně akci a my se ozveme do 24 hodin s nezávazným návrhem řešení.</p>
              <div className="space-y-3 text-sm">
                <p><strong>Email:</strong> <a href="mailto:team@crewmate.cz" className="text-[#1a1a4e] hover:underline">team@crewmate.cz</a></p>
                <p><strong>Infolinka:</strong> <a href="tel:+420774617955" className="text-[#1a1a4e] hover:underline">+420 774 617 955</a></p>
                <p><strong>Instagram:</strong> <a href="https://instagram.com/crewmate.cz" className="text-[#1a1a4e] hover:underline">@crewmate.cz</a></p>
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
