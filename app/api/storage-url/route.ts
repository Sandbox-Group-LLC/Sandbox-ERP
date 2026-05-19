import { NextRequest, NextResponse } from "next/server"
import { getUserWithOrganization } from "@/lib/replit-auth"

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106"

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`
  }
  const pathParts = path.split("/")
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name")
  }
  const bucketName = pathParts[1]
  const objectName = pathParts.slice(2).join("/")
  return { bucketName, objectName }
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string
  objectName: string
  method: "GET" | "PUT" | "DELETE" | "HEAD"
  ttlSec: number
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  }
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  )
  if (!response.ok) {
    throw new Error(`Failed to sign object URL, errorcode: ${response.status}`)
  }
  const { signed_url: signedURL } = await response.json()
  return signedURL
}

export async function POST(request: NextRequest) {
  const user = await getUserWithOrganization()
  if (!user || user.approvalStatus !== "APPROVED" || !user.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { storagePath } = await request.json()

    if (!storagePath || typeof storagePath !== "string") {
      return NextResponse.json({ error: "Storage path is required" }, { status: 400 })
    }

    // Remove storage:// prefix if present
    let objectPath = storagePath
    if (objectPath.startsWith("storage://")) {
      objectPath = objectPath.replace("storage://", "")
    }

    const { bucketName, objectName } = parseObjectPath(objectPath)

    // Generate a signed URL (valid for 1 hour)
    const signedUrl = await signObjectURL({
      bucketName,
      objectName,
      method: "GET",
      ttlSec: 3600,
    })

    return NextResponse.json({ url: signedUrl })
  } catch (error) {
    console.error("Error generating signed URL:", error)
    return NextResponse.json(
      { error: "Failed to generate image URL" },
      { status: 500 }
    )
  }
}
