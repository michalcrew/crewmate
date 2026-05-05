import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { is2FAEnabled, TWO_FA_TRUST_COOKIE, TWO_FA_SESSION_COOKIE } from "@/lib/2fa/config"
import { verifyTrustToken } from "@/lib/2fa/trust-cookie"

function isDeviceTrustedForRequest(request: NextRequest, userId: string): boolean {
  const trust = request.cookies.get(TWO_FA_TRUST_COOKIE)?.value
  if (verifyTrustToken(trust, userId)) return true
  const session = request.cookies.get(TWO_FA_SESSION_COOKIE)?.value
  if (verifyTrustToken(session, userId)) return true
  return false
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const twoFAOn = is2FAEnabled()
  const twoFATrusted = !!user && twoFAOn && isDeviceTrustedForRequest(request, user.id)

  // Nepřihlášený uživatel na /app/* nebo /login/2fa → /login
  if ((path.startsWith("/app") || path === "/login/2fa") && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Přihlášený uživatel na /app/* ale 2FA neověřené (a 2FA je zapnuté) → /login/2fa
  if (path.startsWith("/app") && user && twoFAOn && !twoFATrusted) {
    const url = request.nextUrl.clone()
    url.pathname = "/login/2fa"
    return NextResponse.redirect(url)
  }

  // Přihlášený uživatel na /login → posuneme dál
  if (path === "/login" && user) {
    const url = request.nextUrl.clone()
    url.pathname = twoFAOn && !twoFATrusted ? "/login/2fa" : "/app"
    return NextResponse.redirect(url)
  }

  // Přihlášený a už ověřený (nebo 2FA off) na /login/2fa → /app
  if (path === "/login/2fa" && user && (!twoFAOn || twoFATrusted)) {
    const url = request.nextUrl.clone()
    url.pathname = "/app"
    return NextResponse.redirect(url)
  }

  // QW-8 / SEC-015: token-based public routes must not leak token via
  // Referer header to external links and must not be cached (shared proxy
  // or browser back-button could expose token to another user).
  const isTokenRoute =
    request.nextUrl.pathname.startsWith("/formular/") ||
    request.nextUrl.pathname.startsWith("/dochazka/")

  if (isTokenRoute) {
    supabaseResponse.headers.set("Referrer-Policy", "no-referrer")
    supabaseResponse.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    )
    supabaseResponse.headers.set("Pragma", "no-cache")
  } else {
    // Default referrer policy pro všechny ostatní stránky.
    supabaseResponse.headers.set(
      "Referrer-Policy",
      "strict-origin-when-cross-origin",
    )
  }

  // Globální bezpečnostní hlavičky pro celou aplikaci.
  // Hodnoty zvolené tak, aby fungovaly s aktuálním Next.js + Supabase
  // setupem (žádný iframe, žádné cizí senzory, HTTPS-only, MIME-strict).
  supabaseResponse.headers.set("X-Frame-Options", "DENY")
  supabaseResponse.headers.set("X-Content-Type-Options", "nosniff")
  supabaseResponse.headers.set("X-DNS-Prefetch-Control", "off")
  supabaseResponse.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  )
  // HSTS — Vercel produkce běží přes HTTPS. 1 rok + subdomains.
  supabaseResponse.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  )

  return supabaseResponse
}
