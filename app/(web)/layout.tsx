import Link from "next/link"
import { Button } from "@/components/ui/button"
import { MobileMenu } from "@/components/web/mobile-menu"

export default function WebLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900">
      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="block">
            <img src="/images/logo/crewmate-logo.svg" alt="Crewmate" className="h-8" />
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/#sluzby" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Služby
            </Link>
            <Link href="/#jak-to-funguje" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Jak to funguje
            </Link>
            <Link href="/#zkusenosti" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Zkušenosti
            </Link>
            <Link href="/#brigady" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Brigády
            </Link>
            <Link href="/#kontakt" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Kontakt
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/prace" className="text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors hidden sm:inline">
              Chci brigádu
            </Link>
            <Link href="/#kontakt">
              <Button className="bg-[#000066] hover:bg-[#1a1a7e] text-white rounded-full px-6">
                Poptávka
              </Button>
            </Link>
          <MobileMenu />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-[#000044] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
            <div>
              <img src="/images/logo/crewmate-logotyp.svg" alt="Crewmate" className="h-8 mb-2 brightness-0 invert" />
              <p className="text-gray-400 text-sm">Tvůj event. Náš team.</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Navigace</p>
              <div className="space-y-2">
                <Link href="/#sluzby" className="block text-sm text-gray-300 hover:text-white transition-colors">Služby</Link>
                <Link href="/#jak-to-funguje" className="block text-sm text-gray-300 hover:text-white transition-colors">Jak to funguje</Link>
                <Link href="/prace" className="block text-sm text-gray-300 hover:text-white transition-colors">Brigády</Link>
                <Link href="/#kontakt" className="block text-sm text-gray-300 hover:text-white transition-colors">Kontakt</Link>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Fakturační údaje</p>
              <div className="text-sm text-gray-300 space-y-1">
                <p>Crewmate s.r.o.</p>
                <p>IČO: 23782587</p>
                <p>Z. schránka: yw3nx4g</p>
                <p>Revoluční 1403/28</p>
                <p>Nové Město (Praha 1)</p>
                <p>110 00 Praha</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Kontakt</p>
              <div className="text-sm text-gray-300 space-y-1">
                <p><a href="mailto:team@crewmate.cz" className="hover:text-white transition-colors">team@crewmate.cz</a></p>
                <p><a href="tel:+420774617955" className="hover:text-white transition-colors">+420 774 617 955</a></p>
                <p><a href="https://instagram.com/crewmate.cz" className="hover:text-white transition-colors">@crewmate.cz</a></p>
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-6 mb-2">Právní</p>
              <div className="text-sm text-gray-300 space-y-1">
                <p><a href="https://drive.google.com/file/d/1go0Gokh2MykOQM1u2TrMCB2-X7rF6S1i/view" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Ochrana osobních údajů (GDPR)</a></p>
                <p><a href="https://drive.google.com/file/d/1r9-OOyBfjoV3o0zpj_9Jmtlj1lWk0jpi/view" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Obchodní podmínky</a></p>
                <p><a href="https://drive.google.com/file/d/1eg8yJRAL6jUpdHtb5LlxejX7zJKZl1S1/view" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Nastavení cookies</a></p>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-6">
            <p className="text-center text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Crewmate s.r.o. Všechna práva vyhrazena.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
