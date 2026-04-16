import { cn } from "@/lib/utils"
import type { ConversationStatus } from "@/types/email"

const STATUS_CONFIG: Record<ConversationStatus, { label: string; color: string; dot: string }> = {
  nove: { label: "Nové", color: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  ceka_na_nas: { label: "Čeká na nás", color: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  ceka_na_brigadnika: { label: "Čeká na brigádníka", color: "bg-yellow-50 text-yellow-700 border-yellow-200", dot: "bg-yellow-500" },
  vyreseno: { label: "Vyřešeno", color: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500" },
}

export function ConversationStatusBadge({
  status,
  size = "md",
}: {
  status: ConversationStatus
  size?: "sm" | "md"
}) {
  const config = STATUS_CONFIG[status]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium shrink-0",
        config.color,
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      )}
    >
      <span className={cn("rounded-full", config.dot, size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2")} />
      {config.label}
    </span>
  )
}
