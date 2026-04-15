"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Něco se pokazilo</h2>
          <p className="text-muted-foreground mb-4">
            Došlo k neočekávané chybě. Zkuste to znovu.
          </p>
          <Button onClick={reset}>Zkusit znovu</Button>
        </CardContent>
      </Card>
    </div>
  )
}
