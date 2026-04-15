import type { Metadata } from "next"
import { getNabidky } from "@/lib/actions/nabidky"
import { NovaAkceForm } from "@/components/akce/nova-akce-form"

export const metadata: Metadata = { title: "Nová akce" }

export default async function NovaAkcePage() {
  const nabidky = await getNabidky()
  const nabidkyOptions = (nabidky ?? []).map(n => ({ id: n.id, nazev: n.nazev }))

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Nová akce</h1>
      <NovaAkceForm nabidky={nabidkyOptions} />
    </div>
  )
}
