import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getFormularByToken } from "@/lib/actions/formular"
import { DotaznikForm } from "@/components/web/dotaznik-form"

export const metadata: Metadata = {
  title: "Doplnění údajů — Crewmate",
  // QW-8 / SEC-015: token v URL nesmí leakovat do Referer header.
  // Kompletní HTTP hlavičky (Cache-Control + Referrer-Policy) jsou
  // nastaveny v middleware pro /formular/ prefix.
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
}

// Ensure this page is not statically cached (dynamic token-based).
export const dynamic = "force-dynamic"

export default async function FormularPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await getFormularByToken(token)

  if (!data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Odkaz není platný</h1>
        <p className="text-muted-foreground">
          Tento odkaz na formulář již byl použit nebo expiroval. Pokud potřebujete nový odkaz, kontaktujte nás.
        </p>
      </div>
    )
  }

  const brigadnik = data.brigadnik as unknown as {
    id: string; jmeno: string; prijmeni: string; email: string; telefon: string
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">Doplnění osobních údajů</h1>
        <p className="text-muted-foreground">
          Ahoj {brigadnik.jmeno}, pro uzavření DPP potřebujeme doplnit tvoje osobní údaje. Je to zákonná povinnost zaměstnavatele.
        </p>
      </div>

      <DotaznikForm
        token={data.token}
        defaultValues={{
          jmeno: brigadnik.jmeno,
          prijmeni: brigadnik.prijmeni,
          email: brigadnik.email,
          telefon: brigadnik.telefon,
        }}
      />
    </div>
  )
}
