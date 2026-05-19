import { getClientsForSelect, checkCalendarConnection, checkGoogleConnection } from "./actions"
import { ClientCallsClient } from "./client-calls-client"

export const dynamic = "force-dynamic"

export default async function ClientCallsPage() {
  const [clients, isConnected, googleConnection] = await Promise.all([
    getClientsForSelect(),
    checkCalendarConnection(),
    checkGoogleConnection(),
  ])

  return (
    <ClientCallsClient 
      clients={clients} 
      isCalendarConnected={isConnected} 
      isGoogleConnected={googleConnection.connected}
    />
  )
}
