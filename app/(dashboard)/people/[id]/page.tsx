import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, CheckCircle, AlertCircle, Clock, FileText } from "lucide-react"
import { PersonOverview } from "./overview"
import { OnboardingDocuments } from "./onboarding-documents"
import { TimeTracking } from "./time-tracking"
import { PersonContracts } from "./person-contracts"

export const dynamic = "force-dynamic"

const typeColors: Record<string, string> = {
  Employee: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Freelancer: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
}

function OnboardingStatus({ documents }: { documents: Array<{ status: string }> }) {
  const total = documents.length
  if (total === 0) {
    return null
  }
  
  const verified = documents.filter(d => d.status === "VERIFIED").length
  const received = documents.filter(d => d.status === "RECEIVED").length
  const expired = documents.filter(d => d.status === "EXPIRED").length
  const pending = total - verified - received - expired
  
  if (verified === total) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
        <CheckCircle className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Onboarding Complete</span>
      </div>
    )
  }
  
  if (expired > 0) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{expired} Doc{expired > 1 ? 's' : ''} Expired</span>
      </div>
    )
  }
  
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
      <Clock className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">{verified + received}/{total} Docs</span>
    </div>
  )
}

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const person = await prisma.person.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      onboardingDocuments: {
        orderBy: { documentType: "asc" },
      },
    },
  })

  if (!person) {
    notFound()
  }

  const now = new Date()
  await prisma.onboardingDocument.updateMany({
    where: {
      personId: person.id,
      documentType: "COI",
      expirationDate: { lt: now },
      status: { not: "EXPIRED" },
    },
    data: {
      status: "EXPIRED",
    },
  })

  const updatedPerson = await prisma.person.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      onboardingDocuments: {
        orderBy: { documentType: "asc" },
      },
    },
  })

  if (!updatedPerson) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/people">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
              {updatedPerson.name}
            </h1>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                typeColors[updatedPerson.type] || "bg-gray-100 dark:bg-gray-700"
              }`}
            >
              {updatedPerson.type}
            </span>
            <OnboardingStatus documents={updatedPerson.onboardingDocuments} />
          </div>
          {updatedPerson.email && (
            <p className="text-gray-500 dark:text-gray-400">{updatedPerson.email}</p>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto flex flex-wrap gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Onboarding Documents</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          {user.role === "ADMIN" && (
            <TabsTrigger value="time">Time Tracking</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview">
          <PersonOverview person={updatedPerson} />
        </TabsContent>

        <TabsContent value="documents">
          <OnboardingDocuments person={updatedPerson} />
        </TabsContent>

        <TabsContent value="contracts">
          <PersonContracts personId={updatedPerson.id} />
        </TabsContent>

        {user.role === "ADMIN" && (
          <TabsContent value="time">
            <TimeTracking personId={updatedPerson.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
