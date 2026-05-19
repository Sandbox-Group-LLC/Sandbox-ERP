import { NextResponse } from 'next/server'
import { getOrgAuthUrl } from '@/lib/google-oauth'
import { requireAuth } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export async function GET(request: Request) {
  const user = await requireAuth()

  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only admins can connect Google Workspace' }, { status: 403 })
  }

  if (!user.organizationId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const returnTo = searchParams.get('returnTo') || '/settings'

  const nonce = crypto.randomBytes(32).toString('hex')

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      googleOAuthNonce: nonce,
    },
  })

  const state = Buffer.from(JSON.stringify({
    organizationId: user.organizationId,
    userId: user.id,
    returnTo,
    type: 'org_workspace',
    nonce,
  })).toString('base64')

  const authUrl = getOrgAuthUrl(state)

  return NextResponse.redirect(authUrl)
}
