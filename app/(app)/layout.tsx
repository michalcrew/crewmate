import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Auth guard is handled by middleware.ts
  return (
    <div className="dark min-h-screen">
      <Sidebar />
      <div className="md:pl-60 flex flex-col min-h-screen">
        <Topbar />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
