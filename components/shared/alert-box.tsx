import { cn } from "@/lib/utils"
import { AlertTriangle, Info, AlertCircle } from "lucide-react"

const VARIANTS = {
  warning: {
    bg: "bg-amber-50 border-amber-300",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
  },
  info: {
    bg: "bg-blue-50 border-blue-300",
    icon: Info,
    iconColor: "text-blue-500",
  },
  danger: {
    bg: "bg-red-50 border-red-300",
    icon: AlertCircle,
    iconColor: "text-red-500",
  },
} as const

interface AlertItem {
  text: string
  action?: {
    label: string
    href: string
  }
}

interface AlertBoxProps {
  variant: keyof typeof VARIANTS
  title: string
  items: AlertItem[]
  className?: string
}

export function AlertBox({ variant, title, items, className }: AlertBoxProps) {
  if (items.length === 0) return null

  const config = VARIANTS[variant]
  const Icon = config.icon

  return (
    <div className={cn("rounded-xl border-l-4 p-4", config.bg, className)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", config.iconColor)} />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span>{item.text}</span>
            {item.action && (
              <a
                href={item.action.href}
                className="text-xs font-medium text-primary hover:underline shrink-0 ml-3"
              >
                {item.action.label}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
