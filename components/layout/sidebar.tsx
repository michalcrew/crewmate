"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Calendar,
  BarChart3,
  Clock,
  FileText,
  Settings,
  Mail,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NAV_SECTIONS } from "@/lib/constants"

const ICONS = {
  LayoutDashboard,
  Briefcase,
  Users,
  Calendar,
  BarChart3,
  Clock,
  FileText,
  Settings,
  Mail,
} as const

export function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Logo */}
      <div className="flex h-14 items-center px-5 border-b border-sidebar-border shrink-0">
        <Link href="/app" className="block">
          <img src="/images/logo/crewmate-logotyp.svg" alt="Crewmate" className="h-6" />
        </Link>
      </div>

      {/* Navigation sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ICONS[item.icon as keyof typeof ICONS]
                const isActive = item.href === "/app"
                  ? pathname === "/app"
                  : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 h-9 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  )
}
