import { NextResponse } from 'next/server'
import { exchangeOrgCodeForTokens, getOrgGoogleOAuth2Client } from '@/lib/google-oauth'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/session'
import { google } from 'googleapis'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    ? process.env.NEXT_PUBLIC_BASE_URL
    : process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000'

  if (error) {
    console.error('[Google Workspace OAuth] Error:', error)
    return NextResponse.redirect(`${baseUrl}/settings?error=oauth_denied`)
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/settings?error=no_code`)
  }

  let returnTo = '/settings'
  let organizationId: string | null = null
  let stateUserId: string | null = null
  let nonce: string | null = null

  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString())
      returnTo = decoded.returnTo || '/settings'
      organizationId = decoded.organizationId
      stateUserId = decoded.userId
      nonce = decoded.nonce
      if (decoded.type !== 'org_workspace') {
        return NextResponse.redirect(`${baseUrl}/settings?error=invalid_state`)
      }
    } catch (e) {
      console.error('[Google Workspace OAuth] Failed to decode state:', e)
      return NextResponse.redirect(`${baseUrl}/settings?error=invalid_state`)
    }
  }

  if (!organizationId || !nonce) {
    return NextResponse.redirect(`${baseUrl}/settings?error=no_org`)
  }

  let user
  try {
    user = await requireAuth()
  } catch {
    return NextResponse.redirect(`${baseUrl}/login?returnTo=${encodeURIComponent(returnTo)}`)
  }

  if (user.role !== 'ADMIN') {
    return NextResponse.redirect(`${baseUrl}/settings?error=not_admin`)
  }

  if (user.organizationId !== organizationId || user.id !== stateUserId) {
    return NextResponse.redirect(`${baseUrl}/settings?error=org_mismatch`)
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { googleOAuthNonce: true },
  })

  if (!org || org.googleOAuthNonce !== nonce) {
    return NextResponse.redirect(`${baseUrl}/settings?error=invalid_nonce`)
  }

  try {
    const tokens = await exchangeOrgCodeForTokens(code)

    let connectedEmail: string | null = null
    if (tokens.access_token) {
      try {
        const oauth2Client = getOrgGoogleOAuth2Client()
        oauth2Client.setCredentials({ access_token: tokens.access_token })
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
        const userInfo = await oauth2.userinfo.get()
        connectedEmail = userInfo.data.email || null
      } catch (e) {
        console.error('[Google Workspace OAuth] Failed to get user email:', e)
      }
    }

    const updateData: Record<string, any> = {
      googleAccessToken: tokens.access_token,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      googleConnectedEmail: connectedEmail,
      googleConnectedAt: new Date(),
      googleOAuthNonce: null,
    }

    if (tokens.refresh_token) {
      updateData.googleRefreshToken = tokens.refresh_token
    }

    await prisma.organization.update({
      where: { id: organizationId },
      data: updateData,
    })

    console.log('[Google Workspace OAuth] Tokens saved for org:', organizationId, 'email:', connectedEmail)

    return NextResponse.redirect(`${baseUrl}${returnTo}?workspace_connected=true`)
  } catch (err: any) {
    console.error('[Google Workspace OAuth] Token exchange failed:', err)
    return NextResponse.redirect(`${baseUrl}${returnTo}?error=token_exchange_failed`)
  }
}
