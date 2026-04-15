import { createClient } from "@/lib/supabase/server"
import { logout } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LogOut } from "lucide-react"
import { MobileNav } from "./mobile-nav"

export async function Topbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get user profile from public.users
  let profile: { jmeno: string; prijmeni: string; role: string } | null = null
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("jmeno, prijmeni, role")
      .eq("auth_user_id", user.id)
      .single()
    profile = data
  }

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <MobileNav />
        </div>
        <div className="flex items-center gap-3">
          {profile && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium hidden sm:inline">
                {profile.jmeno} {profile.prijmeni}
              </span>
              <Badge variant="outline" className={`text-[10px] hidden md:inline-flex ${
                profile.role === "admin"
                  ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                  : "bg-blue-500/10 text-blue-400 border-blue-500/20"
              }`}>
                {profile.role === "admin" ? "Admin" : "Náborářka"}
              </Badge>
            </div>
          )}
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
