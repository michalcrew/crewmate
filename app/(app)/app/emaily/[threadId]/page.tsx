import { getThread } from "@/lib/actions/email"
import { ThreadDetail } from "@/components/email/thread-detail"
import { redirect } from "next/navigation"

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>
}) {
  const { threadId } = await params
  const result = await getThread(threadId)

  if (!result) redirect("/app/emaily")

  return <ThreadDetail thread={result.thread} messages={result.messages} />
}
