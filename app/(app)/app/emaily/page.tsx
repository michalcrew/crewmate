import { getThreads } from "@/lib/actions/email"
import { InboxLayout } from "@/components/email/inbox-layout"
import { NewEmailDialog } from "@/components/email/new-email-dialog"
import { SyncGmailButton } from "@/components/email/sync-gmail-button"
import { PageHeader } from "@/components/shared/page-header"
import { createClient } from "@/lib/supabase/server"

export default async function EmailyPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const params = await searchParams
  const statusFilter = params.status as "nove" | "ceka_na_brigadnika" | "ceka_na_nas" | "vyreseno" | undefined
  const page = parseInt(params.page ?? "1", 10)

  const [{ threads, total }, brigadnici] = await Promise.all([
    getThreads({ status_filter: statusFilter, page, limit: 50 }),
    getBrigadniciForEmail(),
  ])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Emaily"
          description="Emailová komunikace s brigádníky"
        />
        <div className="pr-4 flex gap-2">
          <SyncGmailButton />
          <NewEmailDialog brigadnici={brigadnici} />
        </div>
      </div>
      <InboxLayout
        threads={threads}
        total={total}
        currentStatus={statusFilter}
        currentPage={page}
      />
    </div>
  )
}

async function getBrigadniciForEmail() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("brigadnici")
    .select("id, jmeno, prijmeni, email")
    .eq("aktivni", true)
    .not("email", "is", null)
    .order("prijmeni")
  return data ?? []
}
