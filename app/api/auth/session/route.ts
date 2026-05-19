import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const session = await prisma.session.findUnique({
    where: { sid: token },
  });

  if (!session) {
    return NextResponse.redirect(new URL("/login?error=invalid_session", request.url));
  }

  // Get user ID from session data and look up their role
  const sessData = session.sess as { userId?: string };
  let redirectPath = "/";
  
  if (sessData?.userId) {
    const user = await prisma.user.findUnique({
      where: { id: sessData.userId },
      select: { role: true },
    });
    
    // CLIENT and EXTERNAL users go to /projects, others go to Dashboard
    if (user?.role === "CLIENT" || user?.role === "EXTERNAL") {
      redirectPath = "/projects";
    }
  }

  // Use NextResponse to set cookie - sameSite: "none" is required for iframe context
  // Use host header to get correct domain (not localhost)
  const host = request.headers.get("host") || request.nextUrl.host;
  const protocol = host.includes("localhost") ? "http" : "https";
  const response = NextResponse.redirect(`${protocol}://${host}${redirectPath}`);
  response.cookies.set("session_id", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
