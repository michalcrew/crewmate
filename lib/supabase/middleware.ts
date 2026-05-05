import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Rozdělení aplikace na 2 domény podle hostu:
// - PUBLIC_HOST (crewmate.cz) — marketing web, /prace, /formular/*, /dochazka/*
// - INTERNAL_HOST (appka.crewmate.cz) — /login, /app/*
// Když uživatel zadá interní cestu na veřejné doméně (nebo opačně), middleware
// ho přesměruje na správnou doménu. Preview URL z Vercelu nebo localhost se
// neomezují (host nematchuje žádné z env hodnot).
function isInternalPath(pathname: string): boolean {
  return pathname.startsWith("/app") || pathname === "/login"
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/prace") ||
    pathname.startsWith("/formular/") ||
    pathname.startsWith("/dochazka/") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  )
}

export async function updateSession(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase()
  const internalHost = (process.env.NEXT_PUBLIC_INTERNAL_HOST ?? "").toLowerCase()
  const publicHost = (process.env.NEXT_PUBLIC_PUBLIC_HOST ?? "").toLowerCase()
  const path = request.nextUrl.pathname
  const search = request.nextUrl.search

  // www.crewmate.cz → crewmate.cz (jen pokud je publicHost nastavený)
  if (publicHost && host === `www.${publicHost}`) {
    return NextResponse.redirect(`https://${publicHost}${path}${search}`, 308)
  }

  // Cross-domain redirect: interní cesta na veřejném hostu → přesměrovat na interní host
  if (publicHost && internalHost && host === publicHost && isInternalPath(path)) {
    return NextResponse.redirect(`https://${internalHost}${path}${search}`, 307)
  }

  // Cross-domain redirect: veřejná cesta na interním hostu → přesměrovat na veřejný host
  if (publicHost && internalHost && host === internalHost && isPublicPath(path)) {
    return NextResponse.redirect(`https://${publicHost}${path}${search}`, 307)
  }

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

  // Protected routes: /app/*
  if (request.nextUrl.pathname.startsWith("/app") && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from /login
  if (request.nextUrl.pathname === "/login" && user) {
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
