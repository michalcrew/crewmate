import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Detail nabídky",
}

export default async function NabidkaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Detail nabídky</h1>
      <p className="text-muted-foreground">
        Nabídka {id}. Pipeline kanban bude implementován v E-0002 (F-0011).
      </p>
    </div>
  )
}
