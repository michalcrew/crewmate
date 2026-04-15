import type { Metadata } from "next"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Šablony",
}

const typBadge = {
  dotaznik: { label: "Dotazník", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  dpp: { label: "DPP", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  prohlaseni: { label: "Prohlášení", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  potvrzeni: { label: "Potvrzení", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  vlastni: { label: "Vlastní", color: "bg-muted text-muted-foreground" },
} as const

export default async function SablonyPage() {
  const supabase = await createClient()
  const { data: sablony } = await supabase
    .from("email_sablony")
    .select("*")
    .order("typ", { ascending: true })

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Emailové šablony</h1>

      {!sablony || sablony.length === 0 ? (
        <p className="text-muted-foreground">Žádné šablony. Šablony se vytvářejí automaticky při prvním nasazení.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sablony.map((s) => {
            const badge = typBadge[s.typ as keyof typeof typBadge]
            return (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{s.nazev}</CardTitle>
                    {badge && (
                      <Badge variant="outline" className={`${badge.color} text-xs`}>{badge.label}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-2">
                    <strong>Předmět:</strong> {s.predmet}
                  </p>
                  <div className="text-xs text-muted-foreground bg-muted/30 rounded p-3 max-h-32 overflow-y-auto">
                    <code className="whitespace-pre-wrap break-all">
                      {s.obsah_html.replace(/<[^>]*>/g, "").slice(0, 200)}...
                    </code>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={s.aktivni ? "default" : "secondary"} className="text-xs">
                      {s.aktivni ? "Aktivní" : "Neaktivní"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
