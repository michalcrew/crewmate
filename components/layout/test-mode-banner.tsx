import { AlertTriangle } from "lucide-react"
import { isTestMode } from "@/lib/utils/test-mode"

/**
 * F-0023: Banner pro test režim. Zobrazí se na všech stránkách v rámci
 * (app) layoutu když je `NEXT_PUBLIC_TEST_MODE=true`. Náborářky a admini
 * tak hned vidí, že systém zatím nesbírá citlivá data a DPP nelze
 * generovat.
 */
export function TestModeBanner() {
  if (!isTestMode()) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center gap-2 text-xs sm:text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p>
          <strong>Testovací režim.</strong> Citlivé údaje (RČ, OP, banka)
          se nesbírají, DPP generování je vypnuto. Plánování směn a
          kontaktní údaje fungují normálně.
        </p>
      </div>
    </div>
  )
}
