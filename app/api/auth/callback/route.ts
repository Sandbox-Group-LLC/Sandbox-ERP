import { NextRequest, NextResponse } from "next/server";
import { handleCallback } from "@/lib/replit-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const hostname = request.headers.get("host") || request.nextUrl.hostname;
  const searchParams = request.nextUrl.searchParams;
  
  try {
    const result = await handleCallback(hostname, searchParams);
    
    if ("error" in result) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(result.error)}`, request.url));
    }

    // Redirect with session token in URL - use host header to get correct domain
    const host = request.headers.get("host") || request.nextUrl.host;
    const protocol = host.includes("localhost") ? "http" : "https";
    const redirectUrl = `${protocol}://${host}/api/auth/session?token=${result.sessionId}`;
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("Callback error:", error);
    return NextResponse.redirect(new URL("/login?error=callback_failed", request.url));
  }
}
