import { NextRequest, NextResponse } from "next/server"
import { Storage } from "@google-cloud/storage"

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

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`
  }
  const pathParts = path.split("/")
  if (pathParts.length < 3) {
    throw new Error("Invalid path")
  }
  const bucketName = pathParts[1]
  const objectName = pathParts.slice(2).join("/")
  return { bucketName, objectName }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    const entityId = path.join("/")
    
    let entityDir = process.env.PRIVATE_OBJECT_DIR
    if (!entityDir) {
      return NextResponse.json({ error: "Object storage not configured" }, { status: 500 })
    }
    
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`
    }
    
    const objectEntityPath = `${entityDir}${entityId}`
    const { bucketName, objectName } = parseObjectPath(objectEntityPath)
    
    const bucket = storage.bucket(bucketName)
    const file = bucket.file(objectName)
    
    const [exists] = await file.exists()
    if (!exists) {
      return NextResponse.json({ error: "Object not found" }, { status: 404 })
    }
    
    const [metadata] = await file.getMetadata()
    const [buffer] = await file.download()
    
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": (metadata.contentType as string) || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000",
      },
    })
  } catch (error) {
    console.error("Error serving object:", error)
    return NextResponse.json({ error: "Failed to serve object" }, { status: 500 })
  }
}
