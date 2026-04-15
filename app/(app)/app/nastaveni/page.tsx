import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Nastavení",
}

export default function NastaveniPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Nastavení</h1>
      <p className="text-muted-foreground">
        Správa uživatelů a konfigurace. Bude implementováno později.
      </p>
    </div>
  )
}
