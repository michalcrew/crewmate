import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      <p className="text-muted-foreground">
        Vítejte v Crewmate. Obsah dashboardu bude doplněn v E-0005 (F-0048).
      </p>
    </div>
  )
}
