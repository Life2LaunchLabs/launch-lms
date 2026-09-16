import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@services/config/config'
import { getDomainFromRequest } from '@services/auth/cookies'
import { isManagedHost, safeHandoffPath } from '@services/routing/handoff'
import { buildPublicRequestUrl } from '@services/routing/context'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const publicUrl = new URL(buildPublicRequestUrl(request.url,
    request.headers.get('x-forwarded-host') || request.headers.get('host'),
    request.headers.get('x-forwarded-proto')))
  const source = request.nextUrl.searchParams.get('source') || ''
  const returnPath = request.nextUrl.searchParams.get('return') || '/'
  const target = publicUrl.host
  const domain = getDomainFromRequest(request).domain
  if (getConfig('NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE', 'shared-domain') !== 'host-only' ||
      !isManagedHost(source, domain) || !isManagedHost(target, domain) ||
      !safeHandoffPath(returnPath)) {
    return NextResponse.json({ error: 'Invalid session handoff' }, { status: 400 })
  }
  if (source === target) return NextResponse.redirect(new URL(returnPath, publicUrl))

  const state = randomBytes(32).toString('base64url')
  const sourceUrl = new URL('/api/auth/handoff/issue', `${publicUrl.protocol}//${source}`)
  sourceUrl.searchParams.set('target', target)
  sourceUrl.searchParams.set('state', state)
  sourceUrl.searchParams.set('return', returnPath)
  const response = NextResponse.redirect(sourceUrl)
  const stateCookie = publicUrl.protocol === 'https:'
    ? '__Host-launchlms_handoff_state' : 'launchlms_handoff_state'
  response.cookies.set(stateCookie, state, {
    httpOnly: true, secure: publicUrl.protocol === 'https:', sameSite: 'lax',
    path: '/', maxAge: 120,
  })
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
