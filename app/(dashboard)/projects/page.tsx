import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

export const dynamic = "force-dynamic"

const statusColors: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  Active: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Onsite: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Closed: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
}

export default async function ProjectsPage() {
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const projects = await prisma.project.findMany({
    where: { organizationId: user.organizationId },
    include: { client: true, owner: true },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage your event projects</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {projects.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No projects yet. Convert an opportunity to create your first project.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Client</TableHead>
                    <TableHead className="hidden md:table-cell">Event Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Start Date</TableHead>
                    <TableHead className="hidden md:table-cell">Owner</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell>
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {project.name}
                        </Link>
                        <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {project.client.name}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{project.client.name}</TableCell>
                      <TableCell className="hidden md:table-cell">{project.eventType || "-"}</TableCell>
                      <TableCell>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            statusColors[project.status] || "bg-gray-100 dark:bg-gray-700"
                          }`}
                        >
                          {project.status}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {project.startDate
                          ? format(new Date(project.startDate), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{project.owner?.name || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
