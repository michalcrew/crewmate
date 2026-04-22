import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

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
  // Applies to /formular/[token] (brigádník dotazník) and any other
  // signed-link route we add in the future under these prefixes.
  if (
    request.nextUrl.pathname.startsWith("/formular/") ||
    request.nextUrl.pathname.startsWith("/dochazka/")
  ) {
    supabaseResponse.headers.set("Referrer-Policy", "no-referrer")
    supabaseResponse.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    )
    supabaseResponse.headers.set("Pragma", "no-cache")
  }

  return supabaseResponse
}
