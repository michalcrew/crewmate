import { redirect } from "next/navigation"

export default function VyplatyIndexPage() {
  const now = new Date()
  const mesic = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  redirect(`/app/vyplaty/${mesic}`)
}
