import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { UserPlus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getCurrentUserRole,
  getDashboardDataV2,
} from "@/lib/actions/dashboard"
import { PageHeader } from "@/components/shared/page-header"
import { NadchazejiciAkceCard } from "@/components/dashboard/nadchazejici-akce-card"
import { DashboardAlerty } from "@/components/dashboard/dashboard-alerty"
import { TeamSouhrnCard } from "@/components/dashboard/team-souhrn-card"
import { MojeHodinyPlaceholderCard } from "@/components/dashboard/moje-hodiny-placeholder"

export const metadata: Metadata = {
  title: "Dashboard",
}

/**
 * F-0017 — role-aware dashboard (rewrite).
 *
 * Flow:
 *  1) Resolve role (auth + users.role lookup via admin client — F-0013 HF4c pattern).
 *  2) Fetch discriminated-union payload z `getDashboardDataV2(role)`.
 *  3) Render shared cards (Nadcházející + Alerts) + role-specific sekce:
 *     - admin → TeamSouhrnCard
 *     - naborar → MojeHodinyPlaceholderCard (F-0019 hook)
 */
export default async function DashboardPage() {
  const session = await getCurrentUserRole()
  if (!session) {
    redirect("/login")
  }

  const data = await getDashboardDataV2(session.role)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          data.role === "admin"
            ? "Přehled týmu a klíčových metrik"
            : "Přehled akcí a úkolů"
        }
        actions={
          <div className="flex gap-2">
            {data.role === "admin" && (
              <Link href="/app/nabidky/nova">
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Zakázka
                </Button>
              </Link>
            )}
            <Link href="/app/brigadnici/novy">
              <Button variant="outline" size="sm">
                <UserPlus className="h-4 w-4 mr-1.5" />
                Brigádník
              </Button>
            </Link>
          </div>
        }
      />

      {/* Role-specific hero */}
      {data.role === "admin" ? (
        <TeamSouhrnCard data={data.teamSouhrn} />
      ) : (
        <MojeHodinyPlaceholderCard />
      )}

      {/* Shared: alerts */}
      <DashboardAlerty alerts={data.alerts} />

      {/* Shared: nadcházející akce */}
      <NadchazejiciAkceCard akce={data.nadchazejici} />
    </div>
  )
}
