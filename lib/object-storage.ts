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

export async function signObjectURL({
  objectPath,
  method,
  ttlSec = 900,
}: {
  objectPath: string
  method: "GET" | "PUT" | "DELETE" | "HEAD"
  ttlSec?: number
}): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR
  if (!privateObjectDir) {
    throw new Error("Object storage not configured")
  }

  let fullPath: string
  
  if (objectPath.includes("replit-objstore-")) {
    fullPath = objectPath
  } else if (objectPath.startsWith(privateObjectDir)) {
    fullPath = objectPath
  } else {
    fullPath = `${privateObjectDir}${objectPath.startsWith("/") ? "" : "/"}${objectPath}`
  }

  const { bucketName, objectName } = parseObjectPath(fullPath)

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

export async function getSignedReadUrl(objectPath: string, ttlSec = 1800): Promise<string> {
  return signObjectURL({ objectPath, method: "GET", ttlSec })
}

export async function getSignedUploadUrl(objectPath: string, ttlSec = 900): Promise<string> {
  return signObjectURL({ objectPath, method: "PUT", ttlSec })
}
