import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STATUS_VARIANTS = {
  success: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  neutral: "bg-gray-50 text-gray-600 border-gray-200",
  primary: "bg-primary/10 text-primary border-primary/20",
} as const

interface StatusBadgeProps {
  variant: keyof typeof STATUS_VARIANTS
  children: React.ReactNode
  className?: string
  dot?: boolean
}

export function StatusBadge({ variant, children, className, dot }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", STATUS_VARIANTS[variant], className)}
    >
      {dot && (
        <span className={cn(
          "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
          variant === "success" && "bg-green-500",
          variant === "warning" && "bg-amber-500",
          variant === "danger" && "bg-red-500",
          variant === "info" && "bg-blue-500",
          variant === "neutral" && "bg-gray-400",
          variant === "primary" && "bg-primary",
        )} />
      )}
      {children}
    </Badge>
  )
}
