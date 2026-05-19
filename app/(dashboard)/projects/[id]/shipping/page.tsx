import { requireAuthWithOrg } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { ProjectShipping } from "./project-shipping"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ShippingPage({ params }: PageProps) {
  const user = await requireAuthWithOrg()
  const { id: projectId } = await params

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: user.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
    },
  })

  if (!project) {
    notFound()
  }

  return (
    <div className="p-6">
      <ProjectShipping 
        projectId={project.id} 
        organizationId={project.organizationId} 
      />
    </div>
  )
}
