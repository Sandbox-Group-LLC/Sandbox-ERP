import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, FileText, ExternalLink, Pencil } from "lucide-react"
import { TemplateDialog } from "./template-dialog"
import { DocumentTemplateDialog } from "./document-template-dialog"
import { DeleteDocumentTemplateButton } from "./delete-document-template-button"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function TemplatesPage() {
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const [templates, documentTemplates] = await Promise.all([
    prisma.template.findMany({
      where: { organizationId: user.organizationId },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.documentTemplate.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Templates</h1>
        <p className="text-gray-500 dark:text-gray-400">Create reusable templates for projects and documents</p>
      </div>

      <Tabs defaultValue="task-templates" className="w-full">
        <TabsList>
          <TabsTrigger value="task-templates">Task Templates</TabsTrigger>
          <TabsTrigger value="document-templates">Document Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="task-templates" className="space-y-4">
          <div className="flex justify-end">
            <TemplateDialog>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Template
              </Button>
            </TemplateDialog>
          </div>

          {templates.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500 dark:text-gray-400">
                No task templates yet. Create your first template to streamline project setup.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <Link key={template.id} href={`/templates/${template.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardHeader>
                      <CardTitle className="text-lg dark:text-white">{template.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                        {template.eventType && (
                          <p>Event Type: {template.eventType}</p>
                        )}
                        <p>{template._count.tasks} tasks</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="document-templates" className="space-y-4">
          <div className="flex justify-end">
            <DocumentTemplateDialog>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Document Template
              </Button>
            </DocumentTemplateDialog>
          </div>

          {documentTemplates.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500 dark:text-gray-400">
                No document templates yet. Add Google Doc templates for contracts, SOWs, and more.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {documentTemplates.map((template) => (
                <Card key={template.id} className="h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <CardTitle className="text-lg dark:text-white">{template.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-1">
                        <DocumentTemplateDialog template={template}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DocumentTemplateDialog>
                        <DeleteDocumentTemplateButton id={template.id} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
                      <p className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-medium">
                        {template.templateType}
                      </p>
                      {template.description && (
                        <p className="line-clamp-2">{template.description}</p>
                      )}
                      <a
                        href={template.googleDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open in Google Docs
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
