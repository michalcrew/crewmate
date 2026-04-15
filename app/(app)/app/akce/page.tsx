import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Akce",
}

export default function AkcePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Akce</h1>
      <p className="text-muted-foreground">
        Seznam akcí. Bude implementováno v E-0005 (F-0040).
      </p>
    </div>
  )
}
