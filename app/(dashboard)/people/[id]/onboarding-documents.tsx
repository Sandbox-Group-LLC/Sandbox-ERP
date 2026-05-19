"use client"

import { useEffect, useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Upload, Trash2, FileText, ExternalLink, Loader2 } from "lucide-react"
import { format } from "date-fns"
import {
  initializeDocuments,
  updateDocumentStatus,
  updateDocumentFile,
  updateDocumentExpiration,
  deleteDocument,
} from "./actions"

type DocumentType = "NDA" | "COI" | "W9" | "CONTRACT" | "DIRECT_DEPOSIT" | "OTHER"
type DocumentStatus = "PENDING" | "RECEIVED" | "VERIFIED" | "EXPIRED"

interface OnboardingDocument {
  id: string
  personId: string
  documentType: DocumentType
  status: DocumentStatus
  fileName: string | null
  filePath: string | null
  expirationDate: Date | null
  notes: string | null
}

interface OnboardingDocumentsProps {
  person: {
    id: string
    name: string
    type: string
    onboardingDocuments: OnboardingDocument[]
  }
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  NDA: "Non-Disclosure Agreement",
  COI: "Certificate of Insurance",
  W9: "W-9 Form",
  CONTRACT: "Contract",
  DIRECT_DEPOSIT: "Direct Deposit Form",
  OTHER: "Other",
}

const STATUS_COLORS: Record<DocumentStatus, string> = {
  PENDING: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  RECEIVED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  VERIFIED: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  EXPIRED: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
}

const ALL_DOCUMENT_TYPES: DocumentType[] = [
  "NDA",
  "COI",
  "W9",
  "CONTRACT",
  "DIRECT_DEPOSIT",
  "OTHER",
]

export function OnboardingDocuments({ person }: OnboardingDocumentsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [initialized, setInitialized] = useState(false)
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    if (!initialized && person.onboardingDocuments.length < ALL_DOCUMENT_TYPES.length) {
      setInitialized(true)
      startTransition(async () => {
        await initializeDocuments(person.id)
        router.refresh()
      })
    }
  }, [person.id, person.onboardingDocuments.length, initialized, router])

  const documentsMap = new Map<DocumentType, OnboardingDocument>()
  for (const doc of person.onboardingDocuments) {
    documentsMap.set(doc.documentType, doc)
  }

  async function handleStatusChange(docId: string, status: DocumentStatus) {
    startTransition(async () => {
      await updateDocumentStatus(docId, status)
      router.refresh()
    })
  }

  async function handleFileUpload(docId: string, file: File) {
    setUploadingDocId(docId)
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
          uploadType: "document",
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get upload URL")
      }

      const { uploadUrl, storagePath } = await response.json()

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file")
      }

      await updateDocumentFile(docId, file.name, storagePath)
      router.refresh()
    } catch (error) {
      console.error("Upload error:", error)
      alert("Failed to upload file. Please try again.")
    } finally {
      setUploadingDocId(null)
    }
  }

  function handleFileInputChange(docId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(docId, file)
    }
    e.target.value = ""
  }

  async function handleExpirationChange(docId: string, date: string) {
    startTransition(async () => {
      await updateDocumentExpiration(docId, date || null)
      router.refresh()
    })
  }

  async function handleDelete(docId: string) {
    if (!confirm("Are you sure you want to delete this document record?")) return
    startTransition(async () => {
      await deleteDocument(docId)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding Documents</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">File</TableHead>
                <TableHead className="hidden md:table-cell">Expiration</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ALL_DOCUMENT_TYPES.map((docType) => {
                const doc = documentsMap.get(docType)
                if (!doc) {
                  return (
                    <TableRow key={docType}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{docType}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {DOCUMENT_TYPE_LABELS[docType]}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS.PENDING}>Pending</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-gray-400">
                        -
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-gray-400">
                        -
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-gray-400 text-sm">Loading...</span>
                      </TableCell>
                    </TableRow>
                  )
                }

                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{docType}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {DOCUMENT_TYPE_LABELS[docType]}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Select
                        defaultValue={doc.status}
                        onValueChange={(value) =>
                          handleStatusChange(doc.id, value as DocumentStatus)
                        }
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue>
                            <Badge className={STATUS_COLORS[doc.status]}>
                              {doc.status}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PENDING">Pending</SelectItem>
                          <SelectItem value="RECEIVED">Received</SelectItem>
                          <SelectItem value="VERIFIED">Verified</SelectItem>
                          <SelectItem value="EXPIRED">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {doc.fileName ? (
                        <span className="text-sm text-primary">{doc.fileName}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {docType === "COI" ? (
                        <Input
                          type="date"
                          className="w-[150px]"
                          defaultValue={
                            doc.expirationDate
                              ? format(new Date(doc.expirationDate), "yyyy-MM-dd")
                              : ""
                          }
                          onChange={(e) =>
                            handleExpirationChange(doc.id, e.target.value)
                          }
                          disabled={isPending}
                        />
                      ) : doc.expirationDate ? (
                        format(new Date(doc.expirationDate), "MMM d, yyyy")
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <input
                          type="file"
                          ref={(el) => { fileInputRefs.current[doc.id] = el }}
                          className="hidden"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={(e) => handleFileInputChange(doc.id, e)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRefs.current[doc.id]?.click()}
                          disabled={isPending || uploadingDocId === doc.id}
                        >
                          {uploadingDocId === doc.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-1" />
                          )}
                          {doc.fileName ? "Replace" : "Upload"}
                        </Button>
                        {doc.filePath && (
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <a href={`/api${doc.filePath}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(doc.id)}
                          disabled={isPending || uploadingDocId === doc.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
