"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Calendar,
  BarChart3,
  Clock,
  FileText,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NAV_SECTIONS } from "@/lib/constants"
import { Button } from "@/components/ui/button"

const ICONS = {
  LayoutDashboard,
  Briefcase,
  Users,
  Calendar,
  BarChart3,
  Clock,
  FileText,
  Settings,
} as const

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex items-center justify-center rounded-lg border border-border bg-white p-2 shadow-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar">
        <SheetHeader className="h-14 flex items-center px-5 border-b border-sidebar-border">
          <SheetTitle>
            <img src="/images/logo/crewmate-logotyp.svg" alt="Crewmate" className="h-6" />
          </SheetTitle>
        </SheetHeader>
        <nav className="px-3 py-4 space-y-6">
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
                      onClick={() => setOpen(false)}
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
      </SheetContent>
    </Sheet>
  )
}
