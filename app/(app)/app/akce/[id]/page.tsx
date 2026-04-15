import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Detail akce",
}

export default async function AkceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Detail akce</h1>
      <p className="text-muted-foreground">
        Akce {id}. Bude implementováno v E-0005 (F-0041).
      </p>
    </div>
  )
}
