import type { Metadata } from "next"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/server"
import { getDokumentSablony } from "@/lib/actions/dokument-sablony"
import { PageHeader } from "@/components/shared/page-header"

export const metadata: Metadata = { title: "Šablony" }

const emailTypBadge = {
  dotaznik: { label: "Dotazník", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  dpp: { label: "DPP", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  prohlaseni: { label: "Prohlášení", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  potvrzeni: { label: "Potvrzení", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  vlastni: { label: "Vlastní", color: "bg-muted text-muted-foreground" },
} as const

const dokTypBadge = {
  dpp: { label: "DPP", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  prohlaseni: { label: "Prohlášení", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
} as const

export default async function SablonyPage() {
  const supabase = await createClient()
  const { data: emailSablony } = await supabase
    .from("email_sablony")
    .select("*")
    .order("typ", { ascending: true })

  const dokumentSablony = await getDokumentSablony()

  return (
    <div>
      <PageHeader title="Šablony" description="Dokumentové a emailové šablony" />

      <Tabs defaultValue="dokumenty">
        <TabsList>
          <TabsTrigger value="dokumenty">Šablony dokumentů (DPP / Prohlášení)</TabsTrigger>
          <TabsTrigger value="emaily">Emailové šablony</TabsTrigger>
        </TabsList>

        <TabsContent value="dokumenty" className="mt-4">
          <div className="space-y-4">
            {dokumentSablony.length === 0 ? (
              <p className="text-muted-foreground">Žádné šablony dokumentů.</p>
            ) : (
              dokumentSablony.map((s) => {
                const badge = dokTypBadge[s.typ as keyof typeof dokTypBadge]
                return (
                  <Card key={s.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{s.nazev}</CardTitle>
                          {badge && <Badge variant="outline" className={`${badge.color} text-xs`}>{badge.label}</Badge>}
                          <Badge variant={s.aktivni ? "default" : "secondary"} className="text-xs">
                            {s.aktivni ? "Aktivní" : "Neaktivní"}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Platnost: {new Date(s.platnost_od).toLocaleDateString("cs-CZ")}
                          {s.platnost_do && ` — ${new Date(s.platnost_do).toLocaleDateString("cs-CZ")}`}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {s.poznamka && <p className="text-sm text-muted-foreground mb-2">{s.poznamka}</p>}
                      <details>
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          Zobrazit HTML šablonu ({s.obsah_html.length} znaků)
                        </summary>
                        <div className="mt-2 text-xs bg-muted/30 rounded p-3 max-h-48 overflow-y-auto">
                          <code className="whitespace-pre-wrap break-all">{s.obsah_html}</code>
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="emaily" className="mt-4">
          {!emailSablony || emailSablony.length === 0 ? (
            <p className="text-muted-foreground">Žádné emailové šablony.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {emailSablony.map((s) => {
                const badge = emailTypBadge[s.typ as keyof typeof emailTypBadge]
                return (
                  <Card key={s.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{s.nazev}</CardTitle>
                        {badge && <Badge variant="outline" className={`${badge.color} text-xs`}>{badge.label}</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-2"><strong>Předmět:</strong> {s.predmet}</p>
                      <div className="text-xs text-muted-foreground bg-muted/30 rounded p-3 max-h-32 overflow-y-auto">
                        <code className="whitespace-pre-wrap break-all">
                          {s.obsah_html.replace(/<[^>]*>/g, "").slice(0, 200)}...
                        </code>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
