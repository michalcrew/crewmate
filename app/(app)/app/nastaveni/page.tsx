import type { Metadata } from "next"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { getUsers, getCurrentUserRole } from "@/lib/actions/users"
import { AddUserDialog } from "@/components/settings/add-user-dialog"
import { UserActions } from "@/components/settings/user-actions"

export const metadata: Metadata = { title: "Nastavení" }

export default async function NastaveniPage() {
  const [users, currentRole] = await Promise.all([
    getUsers(),
    getCurrentUserRole(),
  ])

  const isAdmin = currentRole === "admin"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nastavení</h1>
        {isAdmin && <AddUserDialog />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Uživatelé systému</CardTitle>
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
                      <Badge variant="outline" className={
                        u.role === "admin"
                          ? "bg-purple-500/10 text-purple-500 border-purple-500/20"
                          : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      }>
                        {u.role === "admin" ? "Admin" : "Náborářka"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.aktivni ? "default" : "secondary"}>
                        {u.aktivni ? "Aktivní" : "Neaktivní"}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <UserActions userId={u.id} aktivni={u.aktivni} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
