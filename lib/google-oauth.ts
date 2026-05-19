import { google } from 'googleapis'

const SCOPES = [
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
]

const ORG_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL
    ? process.env.NEXT_PUBLIC_BASE_URL
    : process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000'
}

export function getGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET
  
  if (!clientId || !clientSecret) {
    console.error('[Google OAuth] Missing credentials - GOOGLE_CLIENT_ID:', !!clientId, 'GOOGLE_SECRET:', !!clientSecret)
    throw new Error('Google OAuth credentials not configured')
  }
  
  const redirectUri = `${getBaseUrl()}/api/auth/google/callback`
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function getOrgGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET
  
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured')
  }
  
  const redirectUri = `${getBaseUrl()}/api/auth/google-workspace/callback`
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function getAuthUrl(state?: string): string {
  const oauth2Client = getGoogleOAuth2Client()
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: state || '',
  })
}

export function getOrgAuthUrl(state?: string): string {
  const oauth2Client = getOrgGoogleOAuth2Client()
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ORG_SCOPES,
    prompt: 'consent',
    state: state || '',
  })
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getGoogleOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

export async function exchangeOrgCodeForTokens(code: string) {
  const oauth2Client = getOrgGoogleOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

export async function refreshAccessToken(refreshToken: string) {
  const oauth2Client = getGoogleOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await oauth2Client.refreshAccessToken()
  return credentials
}

export async function refreshOrgAccessToken(refreshToken: string) {
  const oauth2Client = getOrgGoogleOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await oauth2Client.refreshAccessToken()
  return credentials
}

export function getAuthenticatedClient(accessToken: string) {
  const oauth2Client = getGoogleOAuth2Client()
  oauth2Client.setCredentials({ access_token: accessToken })
  return oauth2Client
}
