"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { 
  ExternalLink, 
  FileText, 
  Download, 
  Clock, 
  CheckCircle2,
  ArrowRight,
  Link as LinkIcon,
  Edit,
  Sparkles,
  AlertTriangle,
  Info,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ContractStage, Contract, Vendor, ContractVersion, ContractParticipant, Person, Project } from "@prisma/client"
import { updateContractStage, updateContract, pullSignedDocument } from "../actions"
import { getNextAllowedStage } from "@/lib/contract-utils"
import { format } from "date-fns"
import { useRouter } from "next/navigation"

type ContractWithRelations = Contract & {
  project: Project
  vendor: Vendor | null
  versions: ContractVersion[]
  participants: (ContractParticipant & { person: Person | null; vendor: Vendor | null })[]
}

const stages: ContractStage[] = [
  "Draft",
  "InternalReview",
  "VendorReview",
  "Approved",
  "SentForSignature",
  "Signed",
]

const stageColors: Record<ContractStage, string> = {
  Draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  InternalReview: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  VendorReview: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  Approved: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  SentForSignature: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  Signed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
}

const stageLabels: Record<ContractStage, string> = {
  Draft: "Draft",
  InternalReview: "Internal Review",
  VendorReview: "Vendor Review",
  Approved: "Approved",
  SentForSignature: "Sent for Signature",
  Signed: "Signed",
}

const stageDescriptions: Record<ContractStage, string> = {
  Draft: "Initial contract draft being created",
  InternalReview: "Under review by internal team",
  VendorReview: "Sent to vendor for review and comments",
  Approved: "Approved by all parties, ready for signatures",
  SentForSignature: "Sent for electronic signature",
  Signed: "Fully executed contract",
}

export function ContractDetailClient({
  contract: initialContract,
  vendors,
  projectId,
}: {
  contract: ContractWithRelations
  vendors: Vendor[]
  projectId: string
}) {
  const router = useRouter()
  const [contract, setContract] = useState(initialContract)
  const [updating, setUpdating] = useState(false)
  const [pullingPdf, setPullingPdf] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [reviewResult, setReviewResult] = useState<{
    summary: string
    riskLevel: "low" | "medium" | "high"
    issues: {
      severity: "info" | "warning" | "critical"
      category: string
      description: string
      suggestion: string
      originalText?: string
    }[]
    recommendations: string[]
  } | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [editData, setEditData] = useState({
    name: contract.name,
    vendorId: contract.vendorId || "",
  })
  const [googleDocId, setGoogleDocId] = useState("")

  const currentStageIndex = stages.indexOf(contract.stage)

  async function handleAdvanceStage() {
    const nextStage = getNextAllowedStage(contract.stage)
    if (!nextStage) return
    
    setUpdating(true)
    try {
      await updateContractStage(contract.id, nextStage)
      setContract({ ...contract, stage: nextStage })
      router.refresh()
    } catch (error) {
      console.error("Failed to update stage:", error)
      alert(error instanceof Error ? error.message : "Failed to update stage")
    } finally {
      setUpdating(false)
    }
  }

  async function handlePullSignedDocument() {
    setPullingPdf(true)
    try {
      const result = await pullSignedDocument(contract.id)
      setContract(prev => ({ 
        ...prev, 
        signedPdfPath: result.path,
        signedAt: new Date(),
        stage: "Signed"
      }))
      router.refresh()
    } catch (error) {
      console.error("Failed to pull signed document:", error)
      alert("Failed to pull signed document. Make sure the Google Doc is accessible.")
    } finally {
      setPullingPdf(false)
    }
  }

  async function handleUpdateContract() {
    setUpdating(true)
    try {
      await updateContract(contract.id, {
        name: editData.name,
        vendorId: editData.vendorId || null,
      })
      setContract({ ...contract, name: editData.name })
      setEditDialogOpen(false)
      router.refresh()
    } catch (error) {
      console.error("Failed to update contract:", error)
    } finally {
      setUpdating(false)
    }
  }

  async function handleLinkGoogleDoc() {
    if (!googleDocId.trim()) return
    setUpdating(true)
    try {
      await updateContract(contract.id, {
        googleDocId: googleDocId.trim(),
      })
      setLinkDialogOpen(false)
      setGoogleDocId("")
      router.refresh()
    } catch (error) {
      console.error("Failed to link Google Doc:", error)
      alert(error instanceof Error ? error.message : "Failed to link Google Doc. Please check the ID or URL format.")
    } finally {
      setUpdating(false)
    }
  }

  async function handleAIReview() {
    setReviewing(true)
    setReviewError(null)
    setReviewResult(null)
    setReviewDialogOpen(true)
    
    try {
      const response = await fetch(`/api/contracts/${contract.id}/review`, {
        method: "POST",
      })
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to review contract")
      }
      
      setReviewResult(data.review)
    } catch (error) {
      console.error("AI review error:", error)
      setReviewError(error instanceof Error ? error.message : "Failed to review contract")
    } finally {
      setReviewing(false)
    }
  }

  const riskLevelColors = {
    low: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    high: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  }

  const severityIcons = {
    info: <Info className="h-4 w-4 text-blue-500" />,
    warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
    critical: <AlertCircle className="h-4 w-4 text-red-500" />,
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Contract Stage</CardTitle>
                  <CardDescription>
                    {stageDescriptions[contract.stage]}
                  </CardDescription>
                </div>
                <Badge className={stageColors[contract.stage]}>
                  {stageLabels[contract.stage]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 flex-wrap mb-6">
                {stages.map((stage, index) => (
                  <div key={stage} className="flex items-center gap-2">
                    <div
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm ${
                        index <= currentStageIndex
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {index < currentStageIndex ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">
                          {index + 1}
                        </span>
                      )}
                      <span className="hidden sm:inline">{stageLabels[stage]}</span>
                    </div>
                    {index < stages.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                    )}
                  </div>
                ))}
              </div>

              {contract.stage !== "Signed" && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleAdvanceStage} disabled={updating}>
                    {updating ? "Updating..." : `Move to ${stageLabels[getNextAllowedStage(contract.stage) || contract.stage]}`}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Google Document</CardTitle>
              <CardDescription>
                Collaborative editing with suggesting mode enabled
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {contract.googleDocId ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                      <a
                        href={contract.googleDocUrl || `https://docs.google.com/document/d/${contract.googleDocId}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Open in Google Docs
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </a>
                    </Button>
                    <Button variant="outline" asChild>
                      <a
                        href={`https://docs.google.com/document/d/${contract.googleDocId}/edit?mode=suggesting`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Open in Suggesting Mode
                      </a>
                    </Button>
                  </div>
                  
                  {(contract.stage === "SentForSignature" || contract.stage === "Signed") && (
                    <div className="pt-4 border-t">
                      <h4 className="font-medium mb-2">Pull Signed Document</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        {contract.signedPdfPath 
                          ? "The signed PDF has been archived."
                          : "After the document is signed in Google Docs, click below to scan the folder for the signed PDF and archive it."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          onClick={handlePullSignedDocument} 
                          disabled={pullingPdf}
                          variant={contract.signedPdfPath ? "outline" : "secondary"}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {pullingPdf ? "Scanning & Pulling..." : contract.signedPdfPath ? "Re-Pull PDF" : "Pull Signed PDF"}
                        </Button>
                        {contract.signedPdfPath && (
                          <Button
                            variant="default"
                            onClick={async () => {
                              try {
                                const response = await fetch(`/api/storage-url?path=${encodeURIComponent(contract.signedPdfPath!)}`)
                                if (response.ok) {
                                  const data = await response.json()
                                  window.open(data.url, '_blank')
                                }
                              } catch (error) {
                                console.error("Failed to get signed PDF URL:", error)
                              }
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View Signed PDF
                          </Button>
                        )}
                      </div>
                      {contract.signedPdfPath && (
                        <p className="text-sm text-green-600 dark:text-green-400 mt-3">
                          <CheckCircle2 className="h-4 w-4 inline mr-1" />
                          PDF archived successfully
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    No Google Doc linked to this contract
                  </p>
                  <Button onClick={() => setLinkDialogOpen(true)}>
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Link Google Doc
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Version History</CardTitle>
              <CardDescription>
                Track changes and stage transitions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contract.versions.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">
                  No versions recorded yet
                </p>
              ) : (
                <div className="space-y-4">
                  {contract.versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-start gap-4 p-3 rounded-lg bg-muted/50"
                    >
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                        v{version.versionNum}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{version.note || "Version snapshot"}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(version.createdAt), "MMM d, yyyy 'at' h:mm a")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Details</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setEditDialogOpen(true)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Contract Name</p>
                <p className="font-medium">{contract.name}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Vendor</p>
                <p className="font-medium">{contract.vendor?.name || "No vendor assigned"}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="font-medium">
                  {format(new Date(contract.createdAt), "MMM d, yyyy")}
                </p>
              </div>
              {contract.signedAt && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Signed</p>
                    <p className="font-medium text-green-600 dark:text-green-400">
                      {format(new Date(contract.signedAt), "MMM d, yyyy")}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {contract.googleDocId && (
                <Button 
                  variant="default" 
                  className="w-full justify-start"
                  onClick={handleAIReview}
                  disabled={reviewing}
                >
                  {reviewing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  AI Contract Review
                </Button>
              )}
              {contract.googleDocUrl && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href={contract.googleDocUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Document
                  </a>
                </Button>
              )}
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => setEditDialogOpen(true)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Details
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Contract</DialogTitle>
            <DialogDescription>
              Update contract details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Contract Name</Label>
              <Input
                id="edit-name"
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-vendor">Vendor</Label>
              <Select
                value={editData.vendorId || "_none"}
                onValueChange={(value) => setEditData({ ...editData, vendorId: value === "_none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No vendor</SelectItem>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateContract} disabled={updating}>
              {updating ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link Google Doc</DialogTitle>
            <DialogDescription>
              Paste the Google Doc ID or full URL
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="google-doc-id">Google Doc ID or URL</Label>
              <Input
                id="google-doc-id"
                placeholder="e.g., 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                value={googleDocId}
                onChange={(e) => setGoogleDocId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                You can paste either the document ID or the full Google Docs URL
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleLinkGoogleDoc} disabled={updating || !googleDocId.trim()}>
              {updating ? "Linking..." : "Link Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Contract Review
            </DialogTitle>
            <DialogDescription>
              Automated analysis of contract terms and potential risks
            </DialogDescription>
          </DialogHeader>
          
          {reviewing && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Analyzing contract...</p>
              <p className="text-xs text-muted-foreground mt-1">This may take 15-30 seconds</p>
            </div>
          )}
          
          {reviewError && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">Review Failed</span>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{reviewError}</p>
            </div>
          )}
          
          {reviewResult && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-medium mb-1">Summary</h4>
                  <p className="text-sm text-muted-foreground">{reviewResult.summary}</p>
                </div>
                <Badge className={riskLevelColors[reviewResult.riskLevel]}>
                  {reviewResult.riskLevel.toUpperCase()} RISK
                </Badge>
              </div>

              {reviewResult.issues.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Issues Found ({reviewResult.issues.length})</h4>
                  <div className="space-y-3">
                    {reviewResult.issues.map((issue, index) => (
                      <div 
                        key={index} 
                        className="border rounded-lg p-4 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          {severityIcons[issue.severity]}
                          <span className="font-medium">{issue.category}</span>
                          <Badge variant="outline" className="text-xs">
                            {issue.severity}
                          </Badge>
                        </div>
                        <p className="text-sm">{issue.description}</p>
                        {issue.originalText && (
                          <div className="bg-muted/50 p-2 rounded text-xs italic">
                            "{issue.originalText}"
                          </div>
                        )}
                        <div className="flex items-start gap-2 text-sm text-green-700 dark:text-green-300">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{issue.suggestion}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reviewResult.recommendations.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Recommendations</h4>
                  <ul className="space-y-2">
                    {reviewResult.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <ArrowRight className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Close
            </Button>
            {reviewResult && (
              <Button onClick={handleAIReview} disabled={reviewing}>
                <Sparkles className="h-4 w-4 mr-2" />
                Re-analyze
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
