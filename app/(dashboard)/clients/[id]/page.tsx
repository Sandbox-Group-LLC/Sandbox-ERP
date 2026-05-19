import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Plus, Pencil, Globe, MapPin, Building2 } from "lucide-react"
import { ClientDialog } from "../client-dialog"
import { ContactDialog } from "./contact-dialog"
import { DeleteClientButton, DeleteContactButton } from "./delete-buttons"
import { ClientReceivables } from "./receivables/client-receivables"

export const dynamic = "force-dynamic"

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const client = await prisma.client.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      contacts: { orderBy: { name: "asc" } },
      opportunities: { orderBy: { createdAt: "desc" }, take: 5 },
      projects: { orderBy: { createdAt: "desc" } },
      receivables: {
        include: {
          project: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!client) {
    notFound()
  }

  const hasAddress = client.address || client.city || client.state || client.country
  const addressParts = [
    client.address,
    [client.city, client.state, client.postalCode].filter(Boolean).join(", "),
    client.country,
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Link href="/clients">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{client.name}</h1>
              {client.clientCode && (
                <span className="text-sm px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  {client.clientCode}
                </span>
              )}
            </div>
            {client.industry && (
              <p className="text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                <Building2 className="h-4 w-4" />
                {client.industry}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-12">
          <ClientDialog client={client}>
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </ClientDialog>
          <DeleteClientButton clientId={client.id} clientName={client.name} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {client.website && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-gray-400" />
                <a 
                  href={client.website} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                >
                  {client.website.replace(/^https?:\/\//, "")}
                </a>
              </div>
            </CardContent>
          </Card>
        )}
        {hasAddress && (
          <Card className="md:col-span-2 lg:col-span-2">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                <div className="text-gray-600 dark:text-gray-400">
                  {addressParts.map((part, i) => (
                    <div key={i}>{part}</div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {client.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{client.notes}</p>
          </CardContent>
        </Card>
      )}

      <ClientReceivables
        clientId={client.id}
        receivables={client.receivables}
        projects={client.projects.map((p) => ({ id: p.id, name: p.name }))}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Contacts</CardTitle>
            <ContactDialog clientId={client.id}>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </ContactDialog>
          </CardHeader>
          <CardContent>
            {client.contacts.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No contacts yet.</p>
            ) : (
              <div className="space-y-3">
                {client.contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-3 rounded-lg border dark:border-gray-700"
                  >
                    <div>
                      <p className="font-medium dark:text-white">{contact.name}</p>
                      {contact.role && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{contact.role}</p>
                      )}
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {contact.email && <span>{contact.email}</span>}
                        {contact.email && contact.phone && <span> | </span>}
                        {contact.phone && <span>{contact.phone}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <ContactDialog clientId={client.id} contact={contact}>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </ContactDialog>
                      <DeleteContactButton
                        contactId={contact.id}
                        clientId={client.id}
                        contactName={contact.name}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Opportunities</CardTitle>
            </CardHeader>
            <CardContent>
              {client.opportunities.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No opportunities yet.</p>
              ) : (
                <div className="space-y-2">
                  {client.opportunities.map((opp) => (
                    <Link
                      key={opp.id}
                      href={`/opportunities/${opp.id}`}
                      className="block p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm dark:text-white">{opp.eventType || "Opportunity"}</span>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 dark:text-gray-300">
                          {opp.stage}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Projects</CardTitle>
            </CardHeader>
            <CardContent>
              {client.projects.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No projects yet.</p>
              ) : (
                <div className="space-y-2">
                  {client.projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="block p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium dark:text-white">{project.name}</span>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 dark:text-gray-300">
                          {project.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
