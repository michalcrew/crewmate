import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Měsíční přehled",
}

export default function PrehledMesicPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Měsíční přehled</h1>
      <p className="text-muted-foreground">
        Přehled docházky a exporty. Bude implementováno v E-0005 (F-0045).
      </p>
    </div>
  )
}
