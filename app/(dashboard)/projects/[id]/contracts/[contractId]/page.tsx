import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { ContractDetailClient } from "./contract-detail-client"

export const dynamic = "force-dynamic"

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>
}) {
  const { id, contractId } = await params
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const contract = await prisma.contract.findFirst({
    where: { id: contractId },
    include: {
      project: true,
      vendor: true,
      versions: { orderBy: { versionNum: "desc" } },
      participants: { include: { person: true, vendor: true } },
    },
  })

  if (!contract || contract.project.organizationId !== user.organizationId) {
    notFound()
  }

  const vendors = await prisma.vendor.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/projects/${id}?tab=contracts`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
            {contract.name}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {contract.project.name}
          </p>
        </div>
      </div>

      <ContractDetailClient 
        contract={contract as any}
        vendors={vendors}
        projectId={id}
      />
    </div>
  )
}
