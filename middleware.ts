import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const CLIENT_ALLOWED_ROUTES = ["/projects", "/ai-assistant"]
const EXTERNAL_ALLOWED_ROUTES = ["/projects", "/ai-assistant", "/chat"]

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/pending-approval") ||
    pathname.startsWith("/banking") ||
    pathname.startsWith("/budget-portal") ||
    pathname.startsWith("/proof-portal") ||
    pathname.startsWith("/vendor-portal") ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  const sessionCookie = request.cookies.get("session_id")
  if (!sessionCookie) {
    return NextResponse.next()
  }

  try {
    const response = await fetch(new URL("/api/auth/user", request.url), {
      headers: {
        Cookie: `session_id=${sessionCookie.value}`,
      },
    })

    if (!response.ok) {
      return NextResponse.next()
    }

    const user = await response.json()

    if (user.role === "CLIENT") {
      const isAllowed = CLIENT_ALLOWED_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(route + "/")
      )

      if (!isAllowed) {
        return NextResponse.redirect(new URL("/projects", request.url))
      }
    }

    if (user.role === "EXTERNAL") {
      const isAllowed = EXTERNAL_ALLOWED_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(route + "/")
      )

      if (!isAllowed) {
        return NextResponse.redirect(new URL("/projects", request.url))
      }
    }
  } catch (error) {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
