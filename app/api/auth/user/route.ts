import { NextResponse } from "next/server";
import { getUserWithOrganization } from "@/lib/replit-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getUserWithOrganization();
    
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    
    return NextResponse.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      name: user.name || user.firstName || user.email?.split("@")[0] || "User",
      profileImageUrl: user.profileImageUrl,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organization?.name || null,
      approvalStatus: user.approvalStatus,
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
