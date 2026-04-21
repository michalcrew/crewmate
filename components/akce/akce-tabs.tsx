import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * F-0015 US-1A — Filter tabs (SSR Link-based, pattern z F-0012 nabidky).
 * ?stav=planovana|probehla|zrusena|all (default=planovana)
 *
 * Server Component — no client handlers, pure Link.
 */
export function AkceTabs({
  active,
  counts,
}: {
  active: string
  counts: { planovana: number; probehla: number; zrusena: number; all: number }
}) {
  const TABS: Array<{ value: string; label: string; count: number }> = [
    { value: "planovana", label: "Plánované", count: counts.planovana },
    { value: "probehla", label: "Proběhlé", count: counts.probehla },
    { value: "zrusena", label: "Zrušené", count: counts.zrusena },
    { value: "all", label: "Všechny", count: counts.all },
  ]

  return (
    <div className="flex items-center gap-1 border-b overflow-x-auto" role="tablist" aria-label="Filtr akcí podle stavu">
      {TABS.map((t) => {
        const isActive = active === t.value
        return (
          <Link
            key={t.value}
            href={`/app/akce?stav=${t.value}`}
            role="tab"
            aria-selected={isActive}
            aria-label={`${t.label} (${t.count})`}
            title={`${t.count} akc${t.count === 1 ? "e" : t.count < 5 ? "e" : "í"}`}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap transition-colors",
              "border-b-2 -mb-px",
              isActive
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
            )}
          >
            <span>{t.label}</span>
            <span
              className={cn(
                "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs tabular-nums min-w-[1.5rem]",
                isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {t.count}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
