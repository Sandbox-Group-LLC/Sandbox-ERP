import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { randomUUID } from "crypto"

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
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const token = formData.get("token") as string | null

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 })
    }

    const access = await prisma.vendorPortalAccess.findUnique({
      where: { accessToken: token },
    })

    if (!access || access.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
    }

    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR
    if (!privateObjectDir) {
      return NextResponse.json({ error: "Object storage not configured" }, { status: 500 })
    }

    const objectId = randomUUID()
    const extension = file.name.split(".").pop() || ""
    const objectName = `${objectId}${extension ? `.${extension}` : ""}`
    const fullPath = `${privateObjectDir}/uploads/${objectName}`

    const { bucketName, objectName: storedObjectName } = parseObjectPath(fullPath)

    const uploadUrl = await signObjectURL({
      bucketName,
      objectName: storedObjectName,
      method: "PUT",
      ttlSec: 900,
    })

    const fileBuffer = await file.arrayBuffer()
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      body: fileBuffer,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
    })

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload file to storage")
    }

    return NextResponse.json({
      objectPath: fullPath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    })
  } catch (error) {
    console.error("Vendor upload error:", error)
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}
