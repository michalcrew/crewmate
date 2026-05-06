import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Pozn.: 2FA gate (kontrola, jestli má uživatel ověřené zařízení) běží
// v server komponentě /app/(app)/layout.tsx, ne tady — middleware běží
// na Edge runtime, který nepodporuje node:crypto pro HMAC verifikaci
// trust cookies. Layout běží na Node runtime a má přístup k cookies().

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

  // Nepřihlášený uživatel na /app/* nebo /login/2fa → /login
  if ((path.startsWith("/app") || path === "/login/2fa") && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Přihlášený uživatel na /login → /app
  // (2FA gate v /app layoutu zajistí redirect na /login/2fa pokud potřeba)
  if (path === "/login" && user) {
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
