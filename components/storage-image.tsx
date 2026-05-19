"use client"

import { useStorageUrl } from "@/hooks/use-storage-url"
import { Loader2, ImageIcon } from "lucide-react"

interface StorageImageProps {
  src: string | null | undefined
  alt: string
  className?: string
  fallbackClassName?: string
}

export function StorageImage({ src, alt, className, fallbackClassName }: StorageImageProps) {
  const resolvedUrl = useStorageUrl(src)

  // If source is null/undefined, show placeholder
  if (!src) {
    return (
      <div className={fallbackClassName || "w-10 h-10 bg-muted rounded flex items-center justify-center"}>
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    )
  }

  // If still loading (for storage paths)
  if (src.startsWith("storage://") && !resolvedUrl) {
    return (
      <div className={fallbackClassName || "w-10 h-10 bg-muted rounded flex items-center justify-center"}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // If URL resolved, show image
  if (resolvedUrl) {
    return (
      <img
        src={resolvedUrl}
        alt={alt}
        className={className}
      />
    )
  }

  // Fallback
  return (
    <div className={fallbackClassName || "w-10 h-10 bg-muted rounded flex items-center justify-center"}>
      <ImageIcon className="h-4 w-4 text-muted-foreground" />
    </div>
  )
}
