import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Detail brigádníka",
}

export default async function BrigadnikDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Detail brigádníka</h1>
      <p className="text-muted-foreground">
        Brigádník {id}. Bude implementováno v E-0002 (F-0013).
      </p>
    </div>
  )
}
