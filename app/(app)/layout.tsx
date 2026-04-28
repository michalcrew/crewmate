import { Sidebar } from "@/components/layout/sidebar"
import { UserMenu } from "@/components/layout/user-menu"
import { Topbar } from "@/components/layout/topbar"
import { TestModeBanner } from "@/components/layout/test-mode-banner"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
