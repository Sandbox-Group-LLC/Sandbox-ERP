import { NextRequest, NextResponse } from "next/server";
import { getAuthorizationUrl } from "@/lib/replit-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const hostname = request.headers.get("host") || request.nextUrl.hostname;
  const inviteToken = request.nextUrl.searchParams.get("invite") || undefined;
  
  try {
    const authUrl = await getAuthorizationUrl(hostname, inviteToken);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
  }
}
