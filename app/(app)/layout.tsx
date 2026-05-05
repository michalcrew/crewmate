import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { UserMenu } from "@/components/layout/user-menu"
import { Topbar } from "@/components/layout/topbar"
import { TestModeBanner } from "@/components/layout/test-mode-banner"
import { createClient } from "@/lib/supabase/server"
import { is2FAEnabled } from "@/lib/2fa/config"
import { isDeviceTrusted } from "@/lib/2fa/trust-cookie"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 2FA gate: pokud je 2FA zapnuté a uživatel nemá důvěryhodné zařízení,
  // pošleme ho na /login/2fa. Middleware ho sem nepustil bez auth, takže
  // user je tady vždy přihlášený.
  if (is2FAEnabled()) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user && !(await isDeviceTrusted(user.id))) {
      redirect("/login/2fa")
    }
  }
  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — server component (renders UserMenu with logout) */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-sidebar-border bg-sidebar z-30">
        <Sidebar />
        <UserMenu />
      </div>

      <div className="flex flex-1 min-w-0 flex-col md:pl-64">
        {/* Mobile topbar (hamburger + user name + logout). Desktop uses sidebar UserMenu. */}
        <div className="md:hidden">
          <Topbar />
        </div>

        <TestModeBanner />

        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
