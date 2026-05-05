/**
 * HF4 — Shared helper pro sestavení email podpisu z `users` row.
 * Pokud `pridat_logo=true`, prependuje Crewmate logo img. `users.podpis`
 * už je sanitizovaný (server action), takže sem chodí pouze safe HTML.
 *
 * Vrací už s leading <br><br>-- separatorem (caller jen appenduje na body).
 */
export type UserSignatureSource = {
  jmeno?: string | null
  prijmeni?: string | null
  podpis?: string | null
  pridat_logo?: boolean | null
} | null

function logoImgTag(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://crewmate.cz"
  const base = appUrl.replace(/\/$/, "")
  const logoUrl = `${base}/logo-crewmate.svg`
  return `<img src="${logoUrl}" alt="Crewmate" style="max-height: 40px; display: block; margin-bottom: 8px; background-color: #ffffff;" />`
}

/**
 * HF4 — prepend Crewmate logo img tag k libovolnému podpisu.
 * `src` je hard-coded (ne user input) → není XSS vektor.
 */
export function prependCrewmateLogo(podpis: string): string {
  return `${logoImgTag()}${podpis}`
}

export function buildUserSignature(user: UserSignatureSource): string {
  if (!user) {
    return "<br><br>--<br>Crewmate"
  }

  const podpis = (user.podpis ?? "").trim()
  const fallback = `${user.jmeno ?? ""} ${user.prijmeni ?? ""}`.trim() || "Crewmate"
  const body = podpis.length > 0 ? podpis : `${fallback}<br>Crewmate`
  const logo = user.pridat_logo ? logoImgTag() : ""
  return `<br><br>--<br>${logo}${body}`
}
