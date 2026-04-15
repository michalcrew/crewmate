import Link from "next/link"

export default function WebLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold">
            Crewmate
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/prace" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Volné pozice
            </Link>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Přihlášení
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Crewmate, s.r.o. Všechna práva vyhrazena.
        </div>
      </footer>
    </div>
  )
}
