import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { refreshOrgAccessToken } from '@/lib/google-oauth'

let connectionSettings: any

async function getOrgCalendarAccessToken(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      googleRefreshToken: true,
      googleAccessToken: true,
      googleTokenExpiry: true,
    },
  })

  if (!org?.googleRefreshToken) {
    throw new Error('Google Workspace not connected for this organization.')
  }

  if (org.googleAccessToken && org.googleTokenExpiry && org.googleTokenExpiry.getTime() > Date.now() + 60000) {
    return org.googleAccessToken
  }

  const credentials = await refreshOrgAccessToken(org.googleRefreshToken)

  if (!credentials.access_token) {
    throw new Error('Failed to refresh Google access token for organization')
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      googleAccessToken: credentials.access_token,
      googleTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    },
  })

  return credentials.access_token
}

async function getConnectorAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl')
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0])

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected')
  }
  return accessToken
}

async function getAccessToken(organizationId?: string): Promise<string> {
  if (organizationId) {
    try {
      return await getOrgCalendarAccessToken(organizationId)
    } catch {
    }
  }
  return getConnectorAccessToken()
}

export async function getGoogleCalendarClient(organizationId?: string) {
  const accessToken = await getAccessToken(organizationId)

  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({
    access_token: accessToken
  })

  return google.calendar({ version: 'v3', auth: oauth2Client })
}

export async function isCalendarConnected(organizationId?: string): Promise<boolean> {
  if (organizationId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { googleRefreshToken: true },
      })
      if (org?.googleRefreshToken) return true
    } catch {
    }
  }

  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null

    if (!xReplitToken || !hostname) {
      return false
    }

    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    )
    const data = await response.json()
    const settings = data.items?.[0]
    return !!(settings?.settings?.access_token || settings?.settings?.oauth?.credentials?.access_token)
  } catch {
    return false
  }
}
