import { createClient } from "@/lib/supabase/server"
import { logout } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LogOut } from "lucide-react"

export async function UserMenu() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Pokud uživatel není vůbec přihlášený, nic nerenderujeme — sidebar
  // patří jen do logged-in route group, ale chrání nás to před edge case.
  if (!user) return null

  let profile: { jmeno: string; prijmeni: string; role: string } | null = null
  const { data } = await supabase
    .from("users")
    .select("jmeno, prijmeni, role")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  profile = data

  // Fallback: pokud nemáme profil (chybí mapování auth_user_id, nebo
  // RLS), pořád ukážeme logout button + email, aby se uživatel mohl
  // odhlásit. Logout musí být dostupný vždy.
  const fullName = profile
    ? `${profile.jmeno ?? ""} ${profile.prijmeni ?? ""}`.trim()
    : (user.email ?? "Uživatel")
  const initials = profile
    ? `${profile.jmeno?.[0] ?? ""}${profile.prijmeni?.[0] ?? ""}`.toUpperCase()
    : (user.email?.[0]?.toUpperCase() ?? "U")
  const roleLabel = profile?.role === "admin" ? "Admin" : profile?.role ? "Náborářka" : null

  return (
    <div className="border-t border-sidebar-border px-3 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
          {initials || "U"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {fullName}
          </p>
          {roleLabel && (
            <Badge
              variant="outline"
              className={`text-[10px] mt-0.5 ${
                profile?.role === "admin"
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-blue-500/10 text-blue-600 border-blue-500/20"
              }`}
            >
              {roleLabel}
            </Badge>
          )}
        </div>
      </div>
      <form action={logout} className="mt-3">
        <Button
          variant="outline"
          size="sm"
          type="submit"
          className="w-full justify-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Odhlásit se
        </Button>
      </form>
    </div>
  )
}
