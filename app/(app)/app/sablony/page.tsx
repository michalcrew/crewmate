import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Šablony",
}

export default function SablonyPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Šablony</h1>
      <p className="text-muted-foreground">
        Emailové šablony. Bude implementováno v E-0006 (F-0057).
      </p>
    </div>
  )
}
