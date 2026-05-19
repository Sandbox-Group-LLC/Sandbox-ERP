import { NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/google-oauth'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/session'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  
  if (error) {
    console.error('[Google OAuth] Error:', error)
    return NextResponse.redirect('/client-calls?error=oauth_denied')
  }
  
  if (!code) {
    return NextResponse.redirect('/client-calls?error=no_code')
  }
  
  let returnTo = '/client-calls'
  let stateUserId: string | null = null
  
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString())
      returnTo = decoded.returnTo || '/client-calls'
      stateUserId = decoded.userId
    } catch (e) {
      console.error('[Google OAuth] Failed to decode state:', e)
    }
  }
  
  const user = await getCurrentUser()
  const userId = user?.id || stateUserId
  
  if (!userId) {
    return NextResponse.redirect('/login?error=not_authenticated')
  }
  
  try {
    const tokens = await exchangeCodeForTokens(code)
    
    console.log('[Google OAuth] Tokens received:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
    })
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    })
    
    console.log('[Google OAuth] Tokens saved for user:', userId)
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000'
    
    return NextResponse.redirect(`${baseUrl}${returnTo}?google_connected=true`)
  } catch (err: any) {
    console.error('[Google OAuth] Token exchange failed:', err)
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : 'http://localhost:5000'
    
    return NextResponse.redirect(`${baseUrl}${returnTo}?error=token_exchange_failed`)
  }
}
