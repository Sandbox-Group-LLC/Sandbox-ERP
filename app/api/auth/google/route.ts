import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/google-oauth'
import { requireAuth } from '@/lib/session'

export async function GET(request: Request) {
  const user = await requireAuth()
  
  const { searchParams } = new URL(request.url)
  const returnTo = searchParams.get('returnTo') || '/client-calls'
  
  const state = Buffer.from(JSON.stringify({ 
    userId: user.id,
    returnTo 
  })).toString('base64')
  
  const authUrl = getAuthUrl(state)
  
  return NextResponse.redirect(authUrl)
}
