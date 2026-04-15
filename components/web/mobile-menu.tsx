"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const NAV_LINKS = [
  { href: "/#sluzby", label: "Služby" },
  { href: "/#jak-to-funguje", label: "Jak to funguje" },
  { href: "/#zkusenosti", label: "Zkušenosti" },
  { href: "/#brigady", label: "Brigády" },
  { href: "/#kontakt", label: "Kontakt" },
]

export function MobileMenu() {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-gray-600 hover:text-gray-900"
        aria-label="Menu"
      >
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {open && (
        <div className="absolute top-16 left-0 right-0 bg-white border-b border-gray-200 shadow-lg z-50">
          <nav className="max-w-7xl mx-auto px-4 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block py-3 text-sm font-medium text-gray-600 hover:text-gray-900 border-b border-gray-50"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4 flex flex-col gap-2">
              <Link href="/prace" onClick={() => setOpen(false)}>
                <Button variant="outline" className="w-full rounded-full">Chci brigádu</Button>
              </Link>
              <Link href="/#kontakt" onClick={() => setOpen(false)}>
                <Button className="w-full bg-[#000066] hover:bg-[#1a1a7e] text-white rounded-full">Poptávka</Button>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}
