import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus } from "lucide-react"
import { ClientDialog } from "./client-dialog"

export const dynamic = "force-dynamic"

export default async function ClientsPage() {
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const clients = await prisma.client.findMany({
    where: { organizationId: user.organizationId },
    include: {
      _count: {
        select: { contacts: true, projects: true, opportunities: true },
      },
    },
    orderBy: { name: "asc" },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Clients</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage your client relationships</p>
        </div>
        <ClientDialog>
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Client
          </Button>
        </ClientDialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No clients yet. Add your first client to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Contacts</TableHead>
                    <TableHead className="hidden md:table-cell">Opportunities</TableHead>
                    <TableHead className="hidden md:table-cell">Projects</TableHead>
                    <TableHead className="hidden lg:table-cell">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Link
                          href={`/clients/${client.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {client.name}
                        </Link>
                        <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {client._count.contacts} contacts · {client._count.projects} projects
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{client._count.contacts}</TableCell>
                      <TableCell className="hidden md:table-cell">{client._count.opportunities}</TableCell>
                      <TableCell className="hidden md:table-cell">{client._count.projects}</TableCell>
                      <TableCell className="hidden lg:table-cell max-w-xs truncate text-gray-500 dark:text-gray-400">
                        {client.notes || "-"}
                      </TableCell>
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
