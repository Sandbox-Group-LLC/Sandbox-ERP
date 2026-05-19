import { AgendaClient } from "./agenda-client"
import { getProjectsForAgenda } from "./actions"

export const dynamic = "force-dynamic"

export default async function AgendaPage() {
  const projects = await getProjectsForAgenda()
  return <AgendaClient projects={projects} />
}
