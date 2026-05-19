import { NextRequest, NextResponse } from "next/server";
import { logout } from "@/lib/replit-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const hostname = request.headers.get("host") || request.nextUrl.hostname;
  
  try {
    const logoutUrl = await logout(hostname);
    return NextResponse.redirect(logoutUrl);
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
