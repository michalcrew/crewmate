import { MobileNav } from "./mobile-nav"

export function Topbar() {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <MobileNav />
          <span className="text-sm text-muted-foreground hidden sm:inline">
            Crewmate
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Admin
          </span>
        </div>
      </div>
    </header>
  )
}
