import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Nabídky",
}

export default function NabidkyPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Nabídky</h1>
      <p className="text-muted-foreground">
        Seznam pracovních nabídek. Bude implementováno v E-0002 (F-0010).
      </p>
    </div>
  )
}
