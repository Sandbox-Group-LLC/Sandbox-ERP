"use client"

import { useState, useEffect } from "react"
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
  DialogTrigger,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  Plus, 
  FileText, 
  ExternalLink, 
  MoreHorizontal,
  Trash2,
  ChevronRight,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ContractStage } from "@prisma/client"
import { getContractsForProject, createContract, deleteContract, getVendorsForProject, getPeopleForProject, getDocumentTemplatesForContracts, checkIsSuperAdmin } from "./actions"
import Link from "next/link"
import { format } from "date-fns"
import { useToast } from "@/hooks/use-toast"

type Contract = Awaited<ReturnType<typeof getContractsForProject>>[number]
type Vendor = Awaited<ReturnType<typeof getVendorsForProject>>[number]
type Person = Awaited<ReturnType<typeof getPeopleForProject>>[number]
type DocumentTemplate = Awaited<ReturnType<typeof getDocumentTemplatesForContracts>>[number]

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

export function ContractsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [newContract, setNewContract] = useState({
    name: "",
    contractType: "vendor" as "vendor" | "person",
    vendorId: "",
    personId: "",
    docOption: "blank" as "none" | "blank" | "template",
    templateId: "",
    isFreelanceContractor: false,
  })

  useEffect(() => {
    loadData()
  }, [projectId])

  async function loadData() {
    setLoading(true)
    try {
      const [contractsData, vendorsData, peopleData, templatesData, superAdminStatus] = await Promise.all([
        getContractsForProject(projectId),
        getVendorsForProject(projectId),
        getPeopleForProject(projectId),
        getDocumentTemplatesForContracts(),
        checkIsSuperAdmin(),
      ])
      setContracts(contractsData)
      setVendors(vendorsData)
      setPeople(peopleData)
      setDocumentTemplates(templatesData)
      setIsSuperAdmin(superAdminStatus)
    } catch (error) {
      console.error("Failed to load contracts:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newContract.name.trim()) return
    
    if (newContract.docOption === "template" && !newContract.templateId) {
      toast({
        title: "Template required",
        description: "Please select a document template.",
        variant: "destructive",
      })
      return
    }
    
    setCreating(true)
    try {
      const selectedTemplate = documentTemplates.find(t => t.id === newContract.templateId)
      await createContract(projectId, {
        name: newContract.name,
        vendorId: newContract.contractType === "vendor" && newContract.vendorId ? newContract.vendorId : undefined,
        personId: newContract.contractType === "person" && newContract.personId ? newContract.personId : undefined,
        docOption: newContract.docOption,
        templateUrl: newContract.docOption === "template" && selectedTemplate ? selectedTemplate.googleDocUrl : undefined,
        isFreelanceContractor: newContract.isFreelanceContractor,
      })
      setNewContract({ name: "", contractType: "vendor", vendorId: "", personId: "", docOption: "blank", templateId: "", isFreelanceContractor: false })
      setDialogOpen(false)
      toast({
        title: "Contract created",
        description: "The contract has been created successfully.",
      })
      await loadData()
    } catch (error) {
      console.error("Failed to create contract:", error)
      toast({
        title: "Failed to create contract",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(contractId: string) {
    if (!confirm("Are you sure you want to delete this contract?")) return
    try {
      await deleteContract(contractId)
      toast({
        title: "Contract deleted",
        description: "The contract has been deleted.",
      })
      await loadData()
    } catch (error) {
      console.error("Failed to delete contract:", error)
      toast({
        title: "Failed to delete contract",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      })
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading contracts...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Contracts</h2>
          <p className="text-sm text-muted-foreground">
            Manage vendor contracts and agreements
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Contract
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Contract</DialogTitle>
              <DialogDescription>
                Create a new contract document for this project
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Contract Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Venue Agreement"
                  value={newContract.name}
                  onChange={(e) => setNewContract({ ...newContract, name: e.target.value })}
                />
              </div>
              <div className="space-y-3">
                <Label>Contract Type</Label>
                <RadioGroup
                  value={newContract.contractType}
                  onValueChange={(value: "vendor" | "person") => 
                    setNewContract({ ...newContract, contractType: value, vendorId: "", personId: "" })
                  }
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="vendor" id="type-vendor" />
                    <Label htmlFor="type-vendor" className="text-sm font-normal">
                      Vendor Contract
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="person" id="type-person" />
                    <Label htmlFor="type-person" className="text-sm font-normal">
                      Person Contract
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              {newContract.contractType === "vendor" ? (
                <div className="space-y-2">
                  <Label htmlFor="vendor">Vendor (Optional)</Label>
                  <Select
                    value={newContract.vendorId || "_none"}
                    onValueChange={(value) => setNewContract({ ...newContract, vendorId: value === "_none" ? "" : value })}
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
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="person">Person (Optional)</Label>
                  <Select
                    value={newContract.personId || "_none"}
                    onValueChange={(value) => setNewContract({ ...newContract, personId: value === "_none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a person" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No person</SelectItem>
                      {people.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name} ({person.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-3">
                <Label>Google Doc Option</Label>
                <RadioGroup
                  value={newContract.docOption}
                  onValueChange={(value: "none" | "blank" | "template") => 
                    setNewContract({ ...newContract, docOption: value })
                  }
                  className="space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="none" id="doc-none" />
                    <Label htmlFor="doc-none" className="text-sm font-normal">
                      No Google Doc
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="blank" id="doc-blank" />
                    <Label htmlFor="doc-blank" className="text-sm font-normal">
                      Create blank Google Doc
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="template" id="doc-template" />
                    <Label htmlFor="doc-template" className="text-sm font-normal">
                      Copy from template
                    </Label>
                  </div>
                </RadioGroup>
                {newContract.docOption === "template" && (
                  <div className="space-y-2 ml-6">
                    <Label htmlFor="templateId" className="text-sm">Select Template</Label>
                    {(!documentTemplates || documentTemplates.length === 0) ? (
                      <p className="text-sm text-muted-foreground">
                        No document templates available.{" "}
                        <Link href="/templates" className="text-primary underline">
                          Create one first
                        </Link>
                      </p>
                    ) : (
                      <>
                        <Select
                          value={newContract.templateId || "_none"}
                          onValueChange={(value) => setNewContract({ ...newContract, templateId: value === "_none" ? "" : value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">Select a template...</SelectItem>
                            {documentTemplates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name} ({template.templateType})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          A copy of this template will be created for the contract
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
              {isSuperAdmin && (
                <div className="flex items-center space-x-2 pt-2 border-t">
                  <Checkbox
                    id="isFreelanceContractor"
                    checked={newContract.isFreelanceContractor}
                    onCheckedChange={(checked) => 
                      setNewContract({ ...newContract, isFreelanceContractor: checked === true })
                    }
                  />
                  <Label htmlFor="isFreelanceContractor" className="text-sm font-normal">
                    Freelance Contractor
                  </Label>
                  <span className="text-xs text-muted-foreground ml-2">
                    (Only visible to super-admin)
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreate} 
                disabled={
                  creating || 
                  !newContract.name.trim() ||
                  (newContract.docOption === "template" && !newContract.templateId)
                }
              >
                {creating ? "Creating..." : "Create Contract"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {contracts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No contracts yet</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Create your first contract to start tracking vendor agreements
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Contract
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {(contracts || []).map((contract) => (
            <Card key={contract.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link 
                        href={`/projects/${projectId}/contracts/${contract.id}`}
                        className="font-medium hover:underline truncate"
                      >
                        {contract.name}
                      </Link>
                      <Badge className={stageColors[contract.stage]}>
                        {stageLabels[contract.stage]}
                      </Badge>
                      {isSuperAdmin && contract.isFreelanceContractor && (
                        <Badge variant="outline" className="text-orange-600 border-orange-600">
                          Freelance
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                      {contract.vendor && (
                        <span>Vendor: {contract.vendor.name}</span>
                      )}
                      {contract.person && (
                        <span>Person: {contract.person.name} ({contract.person.type})</span>
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
                    <Link href={`/projects/${projectId}/contracts/${contract.id}`}>
                      <Button variant="ghost" size="sm">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          className="text-red-600"
                          onClick={() => handleDelete(contract.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
