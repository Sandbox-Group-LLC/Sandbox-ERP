"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileText, ChevronRight, ExternalLink } from "lucide-react"
import { ContractStage } from "@prisma/client"
import { getContractsForPerson } from "./actions"
import Link from "next/link"
import { format } from "date-fns"

type Contract = Awaited<ReturnType<typeof getContractsForPerson>>[number]

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

export function PersonContracts({ personId }: { personId: string }) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadContracts()
  }, [personId])

  async function loadContracts() {
    setLoading(true)
    try {
      const data = await getContractsForPerson(personId)
      setContracts(data)
    } catch (error) {
      console.error("Failed to load contracts:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading contracts...</div>
  }

  if (contracts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No contracts yet</h3>
          <p className="text-sm text-muted-foreground text-center">
            This person has no contracts associated with them.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Contracts</h2>
        <p className="text-sm text-muted-foreground">
          Contracts associated with this person
        </p>
      </div>

      <div className="grid gap-4">
        {contracts.map((contract) => (
          <Card key={contract.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link 
                      href={`/projects/${contract.projectId}/contracts/${contract.id}`}
                      className="font-medium hover:underline truncate"
                    >
                      {contract.name}
                    </Link>
                    <Badge className={stageColors[contract.stage]}>
                      {stageLabels[contract.stage]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                    {contract.project && (
                      <Link 
                        href={`/projects/${contract.project.id}`}
                        className="hover:underline"
                      >
                        Project: {contract.project.name}
                      </Link>
                    )}
                    {contract.vendor && (
                      <span>Vendor: {contract.vendor.name}</span>
                    )}
                    <span>Created: {format(new Date(contract.createdAt), "MMM d, yyyy")}</span>
                    {contract.signedAt && (
                      <span className="text-green-600 dark:text-green-400">
                        Signed: {format(new Date(contract.signedAt), "MMM d, yyyy")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {contract.googleDocUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={contract.googleDocUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Open Doc
                      </a>
                    </Button>
                  )}
                  <Link href={`/projects/${contract.projectId}/contracts/${contract.id}`}>
                    <Button variant="ghost" size="sm">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
