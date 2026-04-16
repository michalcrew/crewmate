import type { DppStav } from "@/types"

const STAV_CONFIG: Record<string, { label: string; color: string }> = {
  zadny: { label: "Nezahájeno", color: "text-muted-foreground" },
  vygenerovano: { label: "Vygenerováno", color: "text-blue-600" },
  odeslano: { label: "Odesláno", color: "text-yellow-600" },
  podepsano: { label: "Podepsáno", color: "text-green-600" },
}

function StavBadge({ stav, timestamp }: { stav: string; timestamp?: string | null }) {
  const config = STAV_CONFIG[stav] ?? STAV_CONFIG.zadny!
  const { label, color } = config
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm font-medium ${color}`}>
        {stav === "podepsano" ? "🟢" : stav === "odeslano" ? "🟡" : stav === "vygenerovano" ? "🔵" : "⚪"}
        {" "}{label}
      </span>
      {timestamp && (
        <span className="text-xs text-muted-foreground">
          ({new Date(timestamp).toLocaleDateString("cs-CZ")})
        </span>
      )}
    </div>
  )
}

export function DocumentEvidenceCard({
  mesicLabel,
  dppStav,
  dppTimestamp,
  prohlaseniStav,
  prohlaseniTimestamp,
}: {
  mesicLabel: string
  dppStav: string
  dppTimestamp?: string | null
  prohlaseniStav: string
  prohlaseniTimestamp?: string | null
}) {
  const isComplete = dppStav === "podepsano" && prohlaseniStav === "podepsano"

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-sm">Dokumentace — {mesicLabel}</h4>
        {isComplete && (
          <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
            ✅ Kompletní
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">DPP:</span>
          <StavBadge stav={dppStav} timestamp={dppTimestamp} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Prohlášení:</span>
          <StavBadge stav={prohlaseniStav} timestamp={prohlaseniTimestamp} />
        </div>
      </div>
    </div>
  )
}
