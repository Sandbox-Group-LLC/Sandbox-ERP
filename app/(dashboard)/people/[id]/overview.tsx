"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pencil, Mail, Phone, DollarSign, Link as LinkIcon, User, CreditCard, ExternalLink, RefreshCw, CheckCircle, AlertCircle, Clock, Building2, Copy, Trash2, Send, Eye, EyeOff, Calculator } from "lucide-react"
import { PersonDialog } from "../person-dialog"
import { setupStripeRecipient, refreshStripeStatus, checkStripeConfigured, getBankingLinkInfo, generateBankingLink, revokeBankingLink, BankingLinkInfo, isSuperAdmin, getFullBankingDetails, FullBankingInfo } from "./actions"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

type StripePayoutStatus = "NOT_SETUP" | "PENDING" | "ACTIVE" | "RESTRICTED"

interface PersonOverviewProps {
  person: {
    id: string
    name: string
    type: string
    email: string | null
    phone: string | null
    defaultCostRate: number
    defaultBillRate: number
    clientBillRate: number
    portfolioUrl: string | null
    emergencyContactName: string | null
    emergencyContactPhone: string | null
    stripeAccountId: string | null
    stripePayoutStatus: StripePayoutStatus
  }
}

const payoutStatusConfig: Record<StripePayoutStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  NOT_SETUP: { label: "Not Set Up", color: "text-gray-500", icon: CreditCard },
  PENDING: { label: "Pending Verification", color: "text-yellow-600", icon: Clock },
  ACTIVE: { label: "Active", color: "text-green-600", icon: CheckCircle },
  RESTRICTED: { label: "Restricted", color: "text-red-600", icon: AlertCircle },
}

export function PersonOverview({ person }: PersonOverviewProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [stripeConfigured, setStripeConfigured] = useState<boolean | null>(null)
  const [payoutStatus, setPayoutStatus] = useState<StripePayoutStatus>(person.stripePayoutStatus)
  
  const [bankingInfo, setBankingInfo] = useState<BankingLinkInfo | null>(null)
  const [bankingLinkUrl, setBankingLinkUrl] = useState<string | null>(null)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [superAdmin, setSuperAdmin] = useState(false)
  const [targetAmount, setTargetAmount] = useState<string>("")

  const rateCalc = useMemo(() => {
    const target = parseFloat(targetAmount)
    if (!target || target <= 0) return null
    const clientRate = person.clientBillRate || 0
    const internalBill = person.defaultBillRate || 0
    if (clientRate <= 0) return null
    const clientHours = Math.ceil(target / clientRate)
    const clientRevenue = clientHours * clientRate
    const totalCost = clientHours * internalBill
    const marginDollars = clientRevenue - totalCost
    const marginPct = clientRate > 0 ? ((clientRate - internalBill) / clientRate) * 100 : 0
    return { clientHours, clientRevenue, totalCost, marginDollars, marginPct }
  }, [targetAmount, person.clientBillRate, person.defaultBillRate])
  const [showFullBanking, setShowFullBanking] = useState(false)
  const [fullBankingInfo, setFullBankingInfo] = useState<FullBankingInfo | null>(null)
  const [loadingFullDetails, setLoadingFullDetails] = useState(false)

  useEffect(() => {
    checkStripeConfigured().then(setStripeConfigured)
    getBankingLinkInfo(person.id).then(setBankingInfo)
    isSuperAdmin().then(setSuperAdmin)
  }, [person.id])

  const handleSetupPayout = async () => {
    setIsLoading(true)
    try {
      const result = await setupStripeRecipient(person.id)
      if (result.success && result.onboardingUrl) {
        window.open(result.onboardingUrl, "_blank")
        setPayoutStatus("PENDING")
        toast({ title: "Onboarding link opened", description: "Complete the form in the new tab to set up payouts." })
      } else {
        toast({ title: "Setup failed", description: result.error, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to start payout setup", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefreshStatus = async () => {
    setIsRefreshing(true)
    try {
      const result = await refreshStripeStatus(person.id)
      if (result.success && result.status) {
        setPayoutStatus(result.status)
        toast({ title: "Status refreshed", description: `Payout status: ${payoutStatusConfig[result.status].label}` })
      } else {
        toast({ title: "Refresh failed", description: result.error, variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to refresh status", variant: "destructive" })
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleGenerateBankingLink = async () => {
    setGeneratingLink(true)
    try {
      const result = await generateBankingLink(person.id)
      setBankingLinkUrl(result.url)
      const info = await getBankingLinkInfo(person.id)
      setBankingInfo(info)
      toast({ title: "Link generated", description: "Copy the link to send to this person" })
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate link", variant: "destructive" })
    } finally {
      setGeneratingLink(false)
    }
  }

  const handleCopyLink = async () => {
    const url = bankingLinkUrl || bankingInfo?.linkUrl
    if (url) {
      await navigator.clipboard.writeText(url)
      toast({ title: "Link copied to clipboard" })
    }
  }

  const handleRevokeBankingLink = async () => {
    try {
      await revokeBankingLink(person.id)
      setBankingInfo(null)
      setBankingLinkUrl(null)
      toast({ title: "Link revoked" })
    } catch (error) {
      toast({ title: "Error", description: "Failed to revoke link", variant: "destructive" })
    }
  }

  const handleViewFullBankingDetails = async () => {
    setLoadingFullDetails(true)
    try {
      const details = await getFullBankingDetails(person.id)
      setFullBankingInfo(details)
      setShowFullBanking(true)
    } catch (error) {
      toast({ title: "Access denied", description: "You are not authorized to view full banking details", variant: "destructive" })
    } finally {
      setLoadingFullDetails(false)
    }
  }

  const statusConfig = payoutStatusConfig[payoutStatus]
  const StatusIcon = statusConfig.icon
  const isLinkExpired = bankingInfo && new Date(bankingInfo.expiresAt) < new Date()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Person Details</CardTitle>
          <PersonDialog person={person}>
            <Button type="button" variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </PersonDialog>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                  <p className="font-medium">
                    {person.email ? (
                      <a
                        href={`mailto:${person.email}`}
                        className="text-primary hover:underline"
                      >
                        {person.email}
                      </a>
                    ) : (
                      <span className="text-gray-400">Not provided</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Phone</p>
                  <p className="font-medium">
                    {person.phone ? (
                      <a
                        href={`tel:${person.phone}`}
                        className="text-primary hover:underline"
                      >
                        {person.phone}
                      </a>
                    ) : (
                      <span className="text-gray-400">Not provided</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <LinkIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Portfolio URL</p>
                  <p className="font-medium">
                    {person.portfolioUrl ? (
                      <a
                        href={person.portfolioUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {person.portfolioUrl}
                      </a>
                    ) : (
                      <span className="text-gray-400">Not provided</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Rates</p>
                  <p className="font-medium">
                    Internal Bill: ${person.defaultBillRate.toLocaleString()} / hr
                  </p>
                  <p className="font-medium">
                    Internal Cost: ${person.defaultCostRate.toLocaleString()} / hr
                  </p>
                  <p className="font-medium text-primary">
                    Client Rate: ${(person as any).clientBillRate?.toLocaleString() ?? "0"} / hr
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Emergency Contact</p>
                  {person.emergencyContactName || person.emergencyContactPhone ? (
                    <>
                      {person.emergencyContactName && (
                        <p className="font-medium">{person.emergencyContactName}</p>
                      )}
                      {person.emergencyContactPhone && (
                        <p className="font-medium">
                          <a
                            href={`tel:${person.emergencyContactPhone}`}
                            className="text-primary hover:underline"
                          >
                            {person.emergencyContactPhone}
                          </a>
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="font-medium text-gray-400">Not provided</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {person.clientBillRate > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Rate Calculator
            </CardTitle>
            <CardDescription>
              Enter a target revenue amount to calculate the client-facing hours needed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-2 flex-1">
                <Label htmlFor="targetAmount">Target Amount ($)</Label>
                <Input
                  id="targetAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 10000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                />
              </div>
              {rateCalc && (
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Client Hours</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{rateCalc.clientHours} hrs</p>
                    <p className="text-xs text-gray-500">@ ${person.clientBillRate}/hr</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Client Revenue</p>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">${rateCalc.clientRevenue.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Internal Cost</p>
                    <p className="text-lg font-bold text-orange-700 dark:text-orange-300">${rateCalc.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Margin</p>
                    <p className="text-lg font-bold text-purple-700 dark:text-purple-300">${rateCalc.marginDollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    <p className="text-xs text-gray-500">{rateCalc.marginPct.toFixed(1)}%</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payout Setup
          </CardTitle>
          <CardDescription>
            Configure payment information for this person to receive payouts via Stripe
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stripeConfigured === false ? (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Stripe is not configured. Add your STRIPE_SECRET_KEY in Settings to enable payouts.
              </p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
                <div>
                  <p className="font-medium">Payout Status</p>
                  <p className={`text-sm ${statusConfig.color}`}>{statusConfig.label}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {payoutStatus === "NOT_SETUP" && (
                  <Button onClick={handleSetupPayout} disabled={isLoading || !person.email}>
                    {isLoading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    Setup Payouts
                  </Button>
                )}
                {payoutStatus === "PENDING" && (
                  <>
                    <Button variant="outline" onClick={handleSetupPayout} disabled={isLoading}>
                      {isLoading ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4 mr-2" />
                      )}
                      Continue Setup
                    </Button>
                    <Button variant="ghost" onClick={handleRefreshStatus} disabled={isRefreshing}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                      Refresh Status
                    </Button>
                  </>
                )}
                {payoutStatus === "ACTIVE" && (
                  <Button variant="ghost" onClick={handleRefreshStatus} disabled={isRefreshing}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                    Refresh Status
                  </Button>
                )}
                {payoutStatus === "RESTRICTED" && (
                  <>
                    <Button onClick={handleSetupPayout} disabled={isLoading}>
                      {isLoading ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4 mr-2" />
                      )}
                      Update Information
                    </Button>
                    <Button variant="ghost" onClick={handleRefreshStatus} disabled={isRefreshing}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                      Refresh Status
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
          {!person.email && payoutStatus === "NOT_SETUP" && (
            <p className="text-sm text-gray-500 mt-2">
              An email address is required to set up payouts. Please add an email first.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            ACH Banking Information
          </CardTitle>
          <CardDescription>
            Generate a secure link for this person to submit their direct deposit banking details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bankingInfo?.submittedAt ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Banking info submitted on {format(new Date(bankingInfo.submittedAt), "MMM d, yyyy 'at' h:mm a")}</span>
              </div>
              {isLinkExpired && (
                <div className="flex items-center gap-2 text-amber-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>Access link expired - banking info is still on file</span>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Bank Name</p>
                  <p className="font-medium">{bankingInfo.bankName || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Account Holder</p>
                  <p className="font-medium">{bankingInfo.accountHolderName || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Account Type</p>
                  <p className="font-medium capitalize">{bankingInfo.accountType || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Account (last 4)</p>
                  <p className="font-medium">****{bankingInfo.accountNumberLast4 || "----"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Routing (last 4)</p>
                  <p className="font-medium">****{bankingInfo.routingNumberLast4 || "----"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {superAdmin && (
                  <Button variant="default" size="sm" onClick={handleViewFullBankingDetails} disabled={loadingFullDetails}>
                    <Eye className="h-4 w-4 mr-2" />
                    {loadingFullDetails ? "Loading..." : "View Full Details"}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleGenerateBankingLink} disabled={generatingLink}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${generatingLink ? "animate-spin" : ""}`} />
                  {generatingLink ? "Generating..." : "Send New Update Link"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleRevokeBankingLink}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Data
                </Button>
              </div>
            </div>
          ) : bankingInfo ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {isLinkExpired ? (
                  <>
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    <span className="text-red-600">Link expired on {format(new Date(bankingInfo.expiresAt), "MMM d, yyyy")}</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-5 w-5 text-yellow-600" />
                    <span>Link expires on {format(new Date(bankingInfo.expiresAt), "MMM d, yyyy")} - Awaiting submission</span>
                  </>
                )}
              </div>
              {bankingInfo.lastAccess && (
                <p className="text-sm text-muted-foreground">
                  Last accessed: {format(new Date(bankingInfo.lastAccess), "MMM d, yyyy 'at' h:mm a")}
                </p>
              )}
              {!isLinkExpired && (
                <div className="flex gap-2">
                  <Input value={bankingInfo.linkUrl} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={handleCopyLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleGenerateBankingLink} disabled={generatingLink}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${generatingLink ? "animate-spin" : ""}`} />
                  {isLinkExpired ? "Generate New Link" : "Regenerate Link"}
                </Button>
                <Button variant="outline" onClick={handleRevokeBankingLink}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Revoke Link
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                No banking link generated yet. Generate a secure link to send to this person.
              </p>
              <Button onClick={handleGenerateBankingLink} disabled={generatingLink}>
                {generatingLink ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Generate Secure Link
              </Button>
              {bankingLinkUrl && (
                <div className="flex gap-2">
                  <Input value={bankingLinkUrl} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={handleCopyLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showFullBanking} onOpenChange={setShowFullBanking}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Full Banking Details
            </DialogTitle>
            <DialogDescription>
              This information is encrypted at rest and only visible to the super administrator.
            </DialogDescription>
          </DialogHeader>
          {fullBankingInfo ? (
            <div className="space-y-4 mt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Bank Name</p>
                  <p className="font-medium text-lg">{fullBankingInfo.bankName || "-"}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Account Holder</p>
                  <p className="font-medium text-lg">{fullBankingInfo.accountHolderName || "-"}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Account Type</p>
                  <p className="font-medium text-lg capitalize">{fullBankingInfo.accountType || "-"}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Submitted</p>
                  <p className="font-medium text-lg">
                    {fullBankingInfo.submittedAt ? format(new Date(fullBankingInfo.submittedAt), "MMM d, yyyy") : "-"}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mb-1">Routing Number</p>
                  <p className="font-mono text-xl tracking-wider">{fullBankingInfo.routingNumber || "-"}</p>
                </div>
                <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mb-1">Account Number</p>
                  <p className="font-mono text-xl tracking-wider">{fullBankingInfo.accountNumber || "-"}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-4">
                This data is encrypted with AES-256-GCM and only accessible to brian@makemysandbox.com
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">No banking information available.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
