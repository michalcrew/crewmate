import { getThreads } from "@/lib/actions/email"
import { InboxLayout } from "@/components/email/inbox-layout"
import { PageHeader } from "@/components/shared/page-header"

export default async function EmailyPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const params = await searchParams
  const statusFilter = params.status as "nove" | "ceka_na_brigadnika" | "ceka_na_nas" | "vyreseno" | undefined
  const page = parseInt(params.page ?? "1", 10)

  const { threads, total } = await getThreads({
    status_filter: statusFilter,
    page,
    limit: 50,
  })

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Emaily"
        description="Emailová komunikace s brigádníky"
      />
      <InboxLayout
        threads={threads}
        total={total}
        currentStatus={statusFilter}
        currentPage={page}
      />
    </div>
  )
}
