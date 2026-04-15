import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Brigádníci",
}

export default function BrigadniciPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Brigádníci</h1>
      <p className="text-muted-foreground">
        Seznam brigádníků. Bude implementováno v E-0002 (F-0012).
      </p>
    </div>
  )
}
