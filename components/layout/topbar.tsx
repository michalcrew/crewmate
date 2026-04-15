import { createClient } from "@/lib/supabase/server"
import { logout } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"
import { MobileNav } from "./mobile-nav"

export async function Topbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <MobileNav />
          <span className="text-sm text-muted-foreground hidden sm:inline">
            Crewmate
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {user?.email ?? ""}
          </span>
          <form action={logout}>
            <Button variant="ghost" size="icon" type="submit">
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Odhlásit</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
