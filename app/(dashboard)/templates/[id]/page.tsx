import { requireAuth } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react"
import { TemplateDialog } from "../template-dialog"
import { TemplateTaskDialog } from "./task-dialog"
import { DeleteTemplateButton, DeleteTaskButton } from "./delete-buttons"

export const dynamic = "force-dynamic"

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireAuth()

  if (!user.organizationId) {
    redirect("/")
  }

  const template = await prisma.template.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      tasks: {
        orderBy: { offsetDaysFromStart: "asc" },
      },
    },
  })

  if (!template) {
    notFound()
  }

  const milestones = Array.from(new Set(template.tasks.map((t) => t.milestone).filter(Boolean)))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/templates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
          {template.eventType && (
            <p className="text-gray-500">{template.eventType}</p>
          )}
        </div>
        <TemplateDialog template={template}>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </TemplateDialog>
        <DeleteTemplateButton templateId={template.id} templateName={template.name} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tasks</CardTitle>
          <TemplateTaskDialog templateId={template.id}>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </TemplateTaskDialog>
        </CardHeader>
        <CardContent>
          {template.tasks.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">
              No tasks yet. Add tasks to build your template.
            </p>
          ) : (
            <div className="space-y-4">
              {milestones.length > 0 &&
                milestones.map((milestone) => (
                  <div key={milestone}>
                    <h3 className="font-medium text-gray-700 mb-2">{milestone}</h3>
                    <div className="space-y-2 ml-4">
                      {template.tasks
                        .filter((t) => t.milestone === milestone)
                        .map((task) => (
                          <TaskRow key={task.id} task={task} templateId={template.id} />
                        ))}
                    </div>
                  </div>
                ))}

              {template.tasks.some((t) => !t.milestone) && (
                <div>
                  <h3 className="font-medium text-gray-700 mb-2">No Milestone</h3>
                  <div className="space-y-2 ml-4">
                    {template.tasks
                      .filter((t) => !t.milestone)
                      .map((task) => (
                        <TaskRow key={task.id} task={task} templateId={template.id} />
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TaskRow({
  task,
  templateId,
}: {
  task: {
    id: string
    title: string
    milestone: string | null
    offsetDaysFromStart: number
    defaultOwnerRole: string | null
  }
  templateId: string
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <div>
        <p className="font-medium">{task.title}</p>
        <div className="text-sm text-gray-500">
          Day {task.offsetDaysFromStart}
          {task.defaultOwnerRole && ` | ${task.defaultOwnerRole}`}
        </div>
      </div>
      <div className="flex gap-1">
        <TemplateTaskDialog templateId={templateId} task={task}>
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        </TemplateTaskDialog>
        <DeleteTaskButton taskId={task.id} templateId={templateId} taskTitle={task.title} />
      </div>
    </div>
  )
}
