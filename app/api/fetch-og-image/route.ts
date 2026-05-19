import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106"

// List of allowed URL schemes
const ALLOWED_SCHEMES = ["http:", "https:"]

// Common retailer domains (for logging/tracking, not enforcing)
const KNOWN_RETAILERS = [
  "amazon.com", "amazon.co.uk", "amazon.ca", "amazon.de",
  "walmart.com", "target.com", "bestbuy.com", "homedepot.com",
  "lowes.com", "wayfair.com", "ikea.com", "etsy.com", "ebay.com",
  "costco.com", "macys.com", "nordstrom.com", "kohls.com",
  "overstock.com", "bedbathandbeyond.com", "crateandbarrel.com",
  "potterybarn.com", "westelm.com", "cb2.com", "pier1.com",
  "williams-sonoma.com", "bhphotovideo.com", "newegg.com"
]

// Block private/internal IP ranges to prevent SSRF
function isPrivateUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase()
  
  // Block localhost variants
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return true
  }
  
  // Block internal hostnames
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return true
  }
  
  // Block common cloud metadata endpoints
  if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
    return true
  }
  
  // Block private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
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

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
    }

    // Security: Check URL scheme
    if (!ALLOWED_SCHEMES.includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Invalid URL scheme" }, { status: 400 })
    }

    // Security: Block private/internal URLs (SSRF protection)
    if (isPrivateUrl(parsedUrl)) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
    }

    // Special handling for Amazon - they block automated requests
    // Try to extract ASIN and use their image CDN directly
    if (parsedUrl.hostname.includes("amazon.")) {
      const asinMatch = url.match(/\/(?:dp|gp\/product|ASIN)\/([A-Z0-9]{10})/i)
        || url.match(/[?&](?:ASIN|asin)=([A-Z0-9]{10})/i)
      
      if (asinMatch) {
        const asin = asinMatch[1].toUpperCase()
        // Try Amazon's product image API endpoint
        const amazonImageUrl = `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_SX500_.jpg`
        
        try {
          const testResponse = await fetch(amazonImageUrl, {
            method: "HEAD",
            signal: AbortSignal.timeout(5000),
          })
          
          if (testResponse.ok) {
            // Download and store the image
            const imageResponse = await fetch(amazonImageUrl, {
              signal: AbortSignal.timeout(10000),
            })
            
            if (imageResponse.ok) {
              const imageBuffer = await imageResponse.arrayBuffer()
              const contentType = imageResponse.headers.get("content-type") || "image/jpeg"
              const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg"
              const filename = `asset-${Date.now()}.${ext}`
              const objectPath = `${process.env.PRIVATE_OBJECT_DIR}/${filename}`
              
              const { bucketName, objectName } = parseObjectPath(objectPath)
              
              const putUrl = await signObjectURL({
                bucketName,
                objectName,
                method: "PUT",
                ttlSec: 3600,
              })
              
              await fetch(putUrl, {
                method: "PUT",
                body: imageBuffer,
                headers: { "Content-Type": contentType },
              })
              
              // Return storage path for permanent storage
              return NextResponse.json({ imageUrl: `storage://${objectPath}` })
            }
          }
        } catch {
          // Fall through to regular scraping attempt
        }
      }
    }

    // Fetch the page with a browser-like user agent
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch the page" },
        { status: 400 }
      )
    }

    const html = await response.text()

    // Extract Open Graph image using multiple fallback methods
    let imageUrl: string | null = null

    // Try og:image first (most reliable)
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
    
    if (ogImageMatch) {
      imageUrl = ogImageMatch[1]
    }

    // Try twitter:image
    if (!imageUrl) {
      const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i)
      
      if (twitterImageMatch) {
        imageUrl = twitterImageMatch[1]
      }
    }

    // Try product image in JSON-LD schema.org markup
    if (!imageUrl) {
      const schemaMatch = html.match(/"image"\s*:\s*"([^"]+)"/i)
      if (schemaMatch) {
        imageUrl = schemaMatch[1]
      }
    }

    // Try image array in JSON-LD
    if (!imageUrl) {
      const imageArrayMatch = html.match(/"image"\s*:\s*\[\s*"([^"]+)"/i)
      if (imageArrayMatch) {
        imageUrl = imageArrayMatch[1]
      }
    }

    // Amazon-specific: look for main product image
    if (!imageUrl && parsedUrl.hostname.includes("amazon")) {
      // Amazon uses landingImage or main-image-container
      const amazonMatch = html.match(/data-old-hires=["']([^"']+)["']/i)
        || html.match(/id=["']landingImage["'][^>]*src=["']([^"']+)["']/i)
        || html.match(/id=["']imgBlkFront["'][^>]*src=["']([^"']+)["']/i)
      if (amazonMatch) {
        imageUrl = amazonMatch[1]
      }
    }

    // Try first large image in product section
    if (!imageUrl) {
      const productImageMatch = html.match(/<img[^>]*(?:class=["'][^"']*product[^"']*["']|id=["'][^"']*product[^"']*["'])[^>]*src=["']([^"']+)["']/i)
      if (productImageMatch) {
        imageUrl = productImageMatch[1]
      }
    }

    // Last resort: try to find any reasonably sized image
    if (!imageUrl) {
      const largeImageMatch = html.match(/<img[^>]*src=["'](https?:\/\/[^"']+(?:\.jpg|\.jpeg|\.png|\.webp)[^"']*)["'][^>]*(?:width=["'](?:4\d\d|[5-9]\d\d|\d{4,})["']|data-(?:src|large))/i)
      if (largeImageMatch) {
        imageUrl = largeImageMatch[1]
      }
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: "No product image found. Try uploading a photo manually instead." },
        { status: 404 }
      )
    }

    // Make relative URLs absolute
    if (imageUrl.startsWith("//")) {
      imageUrl = `https:${imageUrl}`
    } else if (imageUrl.startsWith("/")) {
      imageUrl = `${parsedUrl.origin}${imageUrl}`
    }

    // Validate the image URL
    let imageUrlParsed: URL
    try {
      imageUrlParsed = new URL(imageUrl)
    } catch {
      return NextResponse.json({ error: "Invalid image URL found" }, { status: 400 })
    }

    // Check image URL for SSRF too
    if (!ALLOWED_SCHEMES.includes(imageUrlParsed.protocol) || isPrivateUrl(imageUrlParsed)) {
      return NextResponse.json({ error: "Invalid image URL" }, { status: 400 })
    }

    // Download the image server-side to avoid CORS issues
    const imageResponse = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": url,
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: "Failed to download the image" },
        { status: 400 }
      )
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg"
    
    // Determine file extension from content type
    let extension = "jpg"
    if (contentType.includes("png")) extension = "png"
    else if (contentType.includes("gif")) extension = "gif"
    else if (contentType.includes("webp")) extension = "webp"
    else if (contentType.includes("svg")) extension = "svg"

    // Get object storage config
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR
    if (!privateObjectDir) {
      return NextResponse.json(
        { error: "Object storage not configured" },
        { status: 500 }
      )
    }

    // Generate unique filename
    const objectId = randomUUID()
    const objectName = `${objectId}.${extension}`
    const fullPath = `${privateObjectDir}/uploads/${objectName}`

    const { bucketName, objectName: storedObjectName } = parseObjectPath(fullPath)

    // Get upload URL and upload the image
    const uploadUrl = await signObjectURL({
      bucketName,
      objectName: storedObjectName,
      method: "PUT",
      ttlSec: 900,
    })

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: Buffer.from(imageBuffer),
    })

    if (!uploadResponse.ok) {
      return NextResponse.json(
        { error: "Failed to save the image" },
        { status: 500 }
      )
    }

    // Also extract the product title if available
    let title: string | null = null
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)
    
    if (ogTitleMatch) {
      title = ogTitleMatch[1]
    }

    // Return storage path for permanent storage (not a signed URL that expires)
    return NextResponse.json({
      imageUrl: `storage://${fullPath}`,
      storagePath: fullPath,
      title,
      source: parsedUrl.hostname,
    })
  } catch (error) {
    console.error("Error fetching OG image:", error)
    return NextResponse.json(
      { error: "Failed to fetch image from URL" },
      { status: 500 }
    )
  }
}
