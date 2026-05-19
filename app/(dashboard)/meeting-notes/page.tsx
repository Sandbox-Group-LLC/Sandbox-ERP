import { MeetingNotesClient } from "./meeting-notes-client"
import { getProjectsForSelect, getPeopleForSelect, getClientsForSelect } from "./actions"

export const dynamic = "force-dynamic"

export default async function MeetingNotesPage() {
  const [projects, people, clients] = await Promise.all([
    getProjectsForSelect(),
    getPeopleForSelect(),
    getClientsForSelect(),
  ])

  return <MeetingNotesClient projects={projects} people={people} clients={clients} />
}
