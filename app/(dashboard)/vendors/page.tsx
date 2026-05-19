import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, CheckCircle, Clock, AlertCircle, CreditCard } from "lucide-react"
import { VendorDialog } from "./vendor-dialog"

export const dynamic = "force-dynamic"

const payoutStatusConfig = {
  NOT_SETUP: { label: "Not Set Up", color: "text-gray-400", icon: CreditCard },
  PENDING: { label: "Pending", color: "text-yellow-600", icon: Clock },
  ACTIVE: { label: "Active", color: "text-green-600", icon: CheckCircle },
  RESTRICTED: { label: "Restricted", color: "text-red-600", icon: AlertCircle },
}

export default async function VendorsPage() {
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const vendors = await prisma.vendor.findMany({
    where: { organizationId: user.organizationId },
    include: {
      _count: {
        select: { quotes: true, purchases: true },
      },
    },
    orderBy: { name: "asc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Vendors</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage your vendor relationships</p>
        </div>
        <VendorDialog>
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Vendor
          </Button>
        </VendorDialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {vendors.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No vendors yet. Add your first vendor to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead className="hidden lg:table-cell">Categories</TableHead>
                    <TableHead className="hidden sm:table-cell">Payout</TableHead>
                    <TableHead className="hidden sm:table-cell">Quotes</TableHead>
                    <TableHead className="hidden sm:table-cell">Purchases</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((vendor) => {
                    const statusConfig = payoutStatusConfig[vendor.stripePayoutStatus]
                    const StatusIcon = statusConfig.icon
                    return (
                      <TableRow key={vendor.id}>
                        <TableCell>
                          <VendorDialog vendor={vendor}>
                            <button className="font-medium text-primary hover:underline text-left">
                              {vendor.name}
                            </button>
                          </VendorDialog>
                          <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {vendor.email || "No email"}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{vendor.contactName || "-"}</TableCell>
                        <TableCell className="hidden sm:table-cell">{vendor.email || "-"}</TableCell>
                        <TableCell className="hidden md:table-cell">{vendor.phone || "-"}</TableCell>
                        <TableCell className="hidden lg:table-cell">{vendor.categories || "-"}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center gap-1">
                            <StatusIcon className={`h-4 w-4 ${statusConfig.color}`} />
                            <span className={`text-xs ${statusConfig.color}`}>{statusConfig.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{vendor._count.quotes}</TableCell>
                        <TableCell className="hidden sm:table-cell">{vendor._count.purchases}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
