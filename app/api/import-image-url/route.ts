import { NextRequest, NextResponse } from "next/server"
import { Storage } from "@google-cloud/storage"
import { randomUUID } from "crypto"

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106"

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  } as any,
  projectId: "",
})

const ALLOWED_SCHEMES = ["https:", "http:"]
const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254",
  "metadata.google.internal",
]

function isPrivateUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase()
  
  if (BLOCKED_HOSTS.includes(hostname)) return true
  if (hostname.endsWith(".local")) return true
  if (hostname.endsWith(".internal")) return true
  
  const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number)
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true
  }
  
  return false
}

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
      headers: {
        "Content-Type": "application/json",
      },
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
    const { imageUrl } = await request.json()

    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL is required" }, { status: 400 })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(imageUrl)
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
    }

    if (!ALLOWED_SCHEMES.includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Invalid URL scheme" }, { status: 400 })
    }

    if (isPrivateUrl(parsedUrl)) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
    }

    const imageResponse = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: "Failed to download image. The URL may be invalid or restricted." },
        { status: 400 }
      )
    }

    const contentType = imageResponse.headers.get("content-type") || "image/jpeg"
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "URL does not point to an image" },
        { status: 400 }
      )
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    
    if (imageBuffer.byteLength < 100) {
      return NextResponse.json(
        { error: "Image file is too small or invalid" },
        { status: 400 }
      )
    }

    if (imageBuffer.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image file is too large (max 10MB)" },
        { status: 400 }
      )
    }

    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR
    if (!privateObjectDir) {
      return NextResponse.json(
        { error: "Object storage not configured" },
        { status: 500 }
      )
    }

    const ext = contentType.includes("png") ? "png" : 
                contentType.includes("webp") ? "webp" : 
                contentType.includes("gif") ? "gif" : "jpg"
    const objectId = randomUUID()
    const filename = `${objectId}.${ext}`
    const fullPath = `${privateObjectDir}/uploads/${filename}`

    const { bucketName, objectName } = parseObjectPath(fullPath)
    
    // Get upload URL
    const putUrl = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    })

    // Upload using the signed URL
    const uploadResponse = await fetch(putUrl, {
      method: "PUT",
      body: Buffer.from(imageBuffer),
      headers: { "Content-Type": contentType },
    })

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`)
    }

    // Return the storage path (not a signed URL) for permanent storage
    return NextResponse.json({ 
      imageUrl: `storage://${fullPath}`,
      storagePath: fullPath,
    })
  } catch (error) {
    console.error("Error importing image:", error)
    return NextResponse.json(
      { error: "Failed to import image" },
      { status: 500 }
    )
  }
}
