import type { Metadata } from "next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Docházka",
}

export default async function DochazkaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Docházka</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground">
          <p>Akce {id}</p>
          <p className="mt-2 text-sm">
            PIN ověření a docházkový formulář bude implementován v E-0005 (F-0044).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
