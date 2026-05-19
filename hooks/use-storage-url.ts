"use client"

import { useState, useEffect, useCallback } from "react"

const urlCache = new Map<string, { url: string; expiry: number }>()

export function useStorageUrl(storagePath: string | null | undefined): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!storagePath) {
      setResolvedUrl(null)
      return
    }

    // If it's not a storage path, return as-is (regular URL)
    if (!storagePath.startsWith("storage://")) {
      setResolvedUrl(storagePath)
      return
    }

    // Check cache
    const cached = urlCache.get(storagePath)
    if (cached && cached.expiry > Date.now()) {
      setResolvedUrl(cached.url)
      return
    }

    // Fetch signed URL
    fetch("/api/storage-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.url) {
          // Cache for 50 minutes (signed URL is valid for 1 hour)
          urlCache.set(storagePath, {
            url: data.url,
            expiry: Date.now() + 50 * 60 * 1000,
          })
          setResolvedUrl(data.url)
        }
      })
      .catch(() => {
        setResolvedUrl(null)
      })
  }, [storagePath])

  return resolvedUrl
}

export async function resolveStorageUrl(storagePath: string | null | undefined): Promise<string | null> {
  if (!storagePath) return null
  
  // If it's not a storage path, return as-is
  if (!storagePath.startsWith("storage://")) {
    return storagePath
  }

  // Check cache
  const cached = urlCache.get(storagePath)
  if (cached && cached.expiry > Date.now()) {
    return cached.url
  }

  try {
    const res = await fetch("/api/storage-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath }),
    })
    const data = await res.json()
    if (data.url) {
      urlCache.set(storagePath, {
        url: data.url,
        expiry: Date.now() + 50 * 60 * 1000,
      })
      return data.url
    }
  } catch {
    // Ignore errors
  }
  return null
}
