"use client"

import { use, useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { verifyPin, getKoordinatorDochazka } from "@/lib/actions/dochazka"
import { LogOut, MapPin, Calendar, Clock } from "lucide-react"
import { DochazkaGridV2 } from "@/components/dochazka/dochazka-grid-v2"
import type { DochazkaRowEntry } from "@/components/dochazka/dochazka-row"
import type { DokumentacniStav } from "@/components/brigadnici/dokumentacni-stav-badge"

// User feedback 22.4.: PIN se pamatuje v sessionStorage, aby refresh
// tabu nebo krátkodobé odhlášení neresetovalo koordinátora zpět na
// PIN screen. sessionStorage = platí jen pro aktuální tab, zavře se tab
// = zapomene (bezpečnější než localStorage pro shared device).
const STORAGE_KEY = "crewmate.koord.pin"
type StoredSession = { akceId: string; pin: string }

function loadStoredPin(akceId: string): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    return parsed.akceId === akceId && typeof parsed.pin === "string" ? parsed.pin : null
  } catch {
    return null
  }
}

function saveStoredPin(akceId: string, pin: string) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ akceId, pin } satisfies StoredSession))
  } catch {
    // storage may be blocked (incognito) — acceptable, just won't persist
  }
}

function clearStoredPin() {
  if (typeof window === "undefined") return
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

type AkceInfo = {
  id: string
  nazev: string
  datum: string
  cas_od: string | null
  cas_do: string | null
  misto: string | null
  stav?: string | null
}

type RawEntry = {
  id: string
  status: string
  brigadnik: {
    id: string
    jmeno: string
    prijmeni: string
    telefon: string | null
  } | null
  dochazka: Array<{
    id: string
    prichod: string | null
    odchod: string | null
    hodnoceni: number | null
    poznamka: string | null
  }>
  dokumentacni_stav: string | null
}

function mapEntries(entries: RawEntry[]): DochazkaRowEntry[] {
  return entries
    .filter((e) => !!e.brigadnik)
    .map((e) => {
      const d = e.dochazka?.[0]
      return {
        prirazeniId: e.id,
        brigadnik: {
          id: e.brigadnik!.id,
          jmeno: e.brigadnik!.jmeno,
          prijmeni: e.brigadnik!.prijmeni,
          telefon: e.brigadnik!.telefon ?? null,
        },
        status: e.status,
        dochazka: d
          ? {
              id: d.id,
              prichod: d.prichod,
              odchod: d.odchod,
              hodnoceni: d.hodnoceni,
              poznamka: d.poznamka,
            }
          : null,
        dokumentacniStav: (e.dokumentacni_stav as DokumentacniStav) ?? null,
      }
    })
}

export default function DochazkaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: akceId } = use(params)
  const [akce, setAkce] = useState<AkceInfo | null>(null)
  const [pin, setPin] = useState("")
  const [entries, setEntries] = useState<DochazkaRowEntry[]>([])
  const [pinError, setPinError] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [autoLoading, setAutoLoading] = useState(true)

  const loadWithPin = useCallback(
    async (pinValue: string): Promise<boolean> => {
      const data = await getKoordinatorDochazka(akceId, pinValue)
      if ("error" in data) {
        return false
      }
      setPin(pinValue)
      setAkce(data.akce as AkceInfo)
      setEntries(mapEntries(data.entries as unknown as RawEntry[]))
      saveStoredPin(akceId, pinValue)
      return true
    },
    [akceId],
  )

  // Auto-load from sessionStorage on mount (fixes "odhlásí a přihlásí,
  // ale nevidí zapsané časy" — po refreshu / re-openu se PIN najde
  // v session, data se načtou čerstvá ze serveru).
  useEffect(() => {
    const stored = loadStoredPin(akceId)
    if (!stored) {
      setAutoLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      const ok = await loadWithPin(stored)
      if (!ok && !cancelled) {
        // PIN invalid nebo expirovaný — vymazat a zobrazit PIN formulář
        clearStoredPin()
      }
      if (!cancelled) setAutoLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [akceId, loadWithPin])

  const refresh = useCallback(async () => {
    if (!pin) return
    const result = await getKoordinatorDochazka(akceId, pin)
    if ("success" in result && result.success) {
      setEntries(mapEntries(result.entries as unknown as RawEntry[]))
    }
  }, [akceId, pin])

  const handlePinSubmit = async (formData: FormData) => {
    setVerifying(true)
    const pinValue = formData.get("pin") as string
    const v = await verifyPin(akceId, pinValue)
    if ("error" in v && v.error) {
      setPinError(v.error ?? "Neplatný PIN")
      setVerifying(false)
      return
    }
    const ok = await loadWithPin(pinValue)
    setVerifying(false)
    if (!ok) {
      setPinError("Chyba načítání")
    }
  }

  const handleSignOut = () => {
    clearStoredPin()
    setPin("")
    setAkce(null)
    setEntries([])
    setPinError("")
  }

  if (autoLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">Načítám…</p>
      </div>
    )
  }

  if (!akce) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold">Crewmate</h1>
          <p className="text-sm text-muted-foreground">Docházka</p>
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle>Zadejte PIN</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handlePinSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">PIN kód</Label>
                <Input
                  id="pin"
                  name="pin"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{4,6}"
                  maxLength={6}
                  minLength={4}
                  placeholder="PIN (4–6 čísel)"
                  className="text-center text-2xl tracking-widest h-14"
                  required
                  autoFocus
                />
              </div>
              {pinError && (
                <p className="text-sm text-destructive text-center">{pinError}</p>
              )}
              <Button type="submit" className="w-full" size="lg" disabled={verifying}>
                {verifying ? "Ověřuji…" : "Ověřit PIN"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-4">
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">Crewmate — Docházka</p>
          <h1 className="text-xl sm:text-2xl font-bold truncate">{akce.nazev}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(akce.datum).toLocaleDateString("cs-CZ")}
            </span>
            {akce.cas_od && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {akce.cas_od.slice(0, 5)}
                {akce.cas_do ? ` — ${akce.cas_do.slice(0, 5)}` : ""}
              </span>
            )}
            {akce.misto && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {akce.misto}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="h-10 shrink-0"
        >
          <LogOut className="w-4 h-4 mr-1" />
          Odhlásit
        </Button>
      </div>

      <DochazkaGridV2
        akceId={akceId}
        editor={{ type: "koordinator", pin }}
        entries={entries}
        onRefresh={refresh}
      />
    </div>
  )
}
