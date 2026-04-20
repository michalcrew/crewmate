import type { Metadata } from "next"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getUsers, getCurrentUserRole } from "@/lib/actions/users"
import { getDokumentSablony, toggleSablonaActive } from "@/lib/actions/dokument-sablony"
import { createClient } from "@/lib/supabase/server"
import { AddUserDialog } from "@/components/settings/add-user-dialog"
import { UserActions } from "@/components/settings/user-actions"
import { AddSablonaDialog } from "@/components/settings/edit-sablona-dialog"
import { SablonaActions } from "@/components/settings/sablona-actions"
import { PodpisForm } from "@/components/settings/podpis-form"
import { PageHeader } from "@/components/shared/page-header"

export const metadata: Metadata = { title: "Nastavení" }

export default async function NastaveniPage() {
  const [users, currentRole, dokumentSablony] = await Promise.all([
    getUsers(),
    getCurrentUserRole(),
    getDokumentSablony(),
  ])

  // Activity log (posledních 100 záznamů)
  const supabase = await createClient()
  const { data: activityLog } = await supabase
    .from("historie")
    .select("*, user:users!historie_user_id_fkey(jmeno, prijmeni)")
    .order("created_at", { ascending: false })
    .limit(100)

  // F-0013: aktuální uživatel pro "Můj profil" tab (podpis).
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const { data: currentUser } = authUser
    ? await supabase
        .from("users")
        .select("id, jmeno, prijmeni, podpis")
        .eq("auth_user_id", authUser.id)
        .single()
    : { data: null }

  const isAdmin = currentRole === "admin"
  const podpisFallback = currentUser
    ? `${currentUser.jmeno} ${currentUser.prijmeni}, tým Crewmate`
    : "Tým Crewmate"

  return (
    <div className="space-y-6">
      <PageHeader title="Nastavení" description="Správa uživatelů, šablon a konfigurace" />

      <Tabs defaultValue="profil">
        <TabsList>
          <TabsTrigger value="profil">Můj profil</TabsTrigger>
          <TabsTrigger value="uzivatele">Uživatelé</TabsTrigger>
          {isAdmin && <TabsTrigger value="sablony">Šablony DPP / Prohlášení</TabsTrigger>}
          {isAdmin && <TabsTrigger value="log">Activity Log</TabsTrigger>}
        </TabsList>

        {/* Můj profil — podpis do emailů (F-0013 US-1E-1) */}
        <TabsContent value="profil" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Můj emailový podpis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Podpis se automaticky vloží na konec každého emailu, který
                odešlete (DPP, prohlášení, vlastní zpráva). Pokud necháte pole
                prázdné, použije se výchozí podpis{" "}
                <em>„{podpisFallback}“</em>.
              </p>
              <PodpisForm
                defaultPodpis={currentUser?.podpis ?? ""}
                fallback={podpisFallback}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Uživatelé */}
        <TabsContent value="uzivatele" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Uživatelé systému</CardTitle>
              {isAdmin && <AddUserDialog />}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jméno</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Stav</TableHead>
                      {isAdmin && <TableHead>Akce</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.jmeno} {u.prijmeni}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={u.role === "admin" ? "bg-purple-500/10 text-purple-500 border-purple-500/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"}>
                            {u.role === "admin" ? "Admin" : "Náborářka"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.aktivni ? "default" : "secondary"}>{u.aktivni ? "Aktivní" : "Neaktivní"}</Badge>
                        </TableCell>
                        {isAdmin && <TableCell><UserActions userId={u.id} aktivni={u.aktivni} /></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Šablony dokumentů */}
        {isAdmin && (
          <TabsContent value="sablony" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Šablony dokumentů</CardTitle>
                <AddSablonaDialog />
              </CardHeader>
              <CardContent className="space-y-4">
                {dokumentSablony.length === 0 ? (
                  <p className="text-muted-foreground">Žádné šablony.</p>
                ) : (
                  dokumentSablony.map((s) => (
                    <div key={s.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.nazev}</span>
                          <Badge variant="outline" className={s.typ === "dpp" ? "bg-green-500/10 text-green-500 border-green-500/20 text-xs" : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-xs"}>
                            {s.typ === "dpp" ? "DPP" : "Prohlášení"}
                          </Badge>
                          <Badge variant={s.aktivni ? "default" : "secondary"} className="text-xs">
                            {s.aktivni ? "Aktivní" : "Neaktivní"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Platnost: {new Date(s.platnost_od).toLocaleDateString("cs-CZ")}
                            {s.platnost_do && ` — ${new Date(s.platnost_do).toLocaleDateString("cs-CZ")}`}
                          </span>
                          <SablonaActions sablonaId={s.id} aktivni={s.aktivni} />
                        </div>
                      </div>
                      {s.poznamka && <p className="text-xs text-muted-foreground mb-2">{s.poznamka}</p>}
                      <details>
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          Zobrazit HTML ({s.obsah_html.length} znaků)
                        </summary>
                        <pre className="mt-2 text-xs bg-muted/30 rounded p-3 max-h-48 overflow-y-auto whitespace-pre-wrap">{s.obsah_html}</pre>
                      </details>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Activity Log */}
        {isAdmin && (
          <TabsContent value="log" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Activity Log (posledních 100 záznamů)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Čas</TableHead>
                        <TableHead>Uživatel</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead>Popis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!activityLog || activityLog.length === 0) ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            Žádné záznamy.
                          </TableCell>
                        </TableRow>
                      ) : (
                        activityLog.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(log.created_at).toLocaleString("cs-CZ")}
                            </TableCell>
                            <TableCell className="text-sm">
                              {(log.user as unknown as { jmeno: string; prijmeni: string } | null)?.jmeno ?? "Systém"}{" "}
                              {(log.user as unknown as { jmeno: string; prijmeni: string } | null)?.prijmeni ?? ""}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{log.typ}</Badge>
                            </TableCell>
                            <TableCell className="text-sm max-w-md truncate">{log.popis}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
