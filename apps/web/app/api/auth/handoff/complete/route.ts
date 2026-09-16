import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@services/config/config'
import {
  ACCESS_TOKEN_COOKIE, ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE, getCookieOptions, getDomainFromRequest,
} from '@services/auth/cookies'
import { isManagedHost, safeHandoffPath } from '@services/routing/handoff'

export const runtime = 'nodejs'

const BACKEND_URL = (process.env.LAUNCHLMS_INTERNAL_BACKEND_URL ||
  getConfig('NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL') || 'http://localhost:1338').replace(/\/+$/, '')

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const ticket = form.get('ticket')
  const state = form.get('state')
  const returnPath = form.get('return_path')
  const stateCookie = request.nextUrl.protocol === 'https:'
    ? '__Host-launchlms_handoff_state' : 'launchlms_handoff_state'
  const cookieState = request.cookies.get(stateCookie)?.value
  const domain = getDomainFromRequest(request).domain
  if (getConfig('NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE', 'shared-domain') !== 'host-only' ||
      !isManagedHost(request.nextUrl.host, domain) ||
      typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(ticket) ||
      typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(state) ||
      typeof returnPath !== 'string' || !safeHandoffPath(returnPath) ||
      !cookieState || cookieState.length !== state.length ||
      !timingSafeEqual(Buffer.from(cookieState), Buffer.from(state))) {
    return NextResponse.json({ error: 'Invalid session handoff' }, { status: 401 })
  }

  try {
    const result = await fetch(`${BACKEND_URL}/api/v1/auth/handoff/redeem`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, target_host: request.nextUrl.host, state, return_path: returnPath }),
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    })
    if (!result.ok) return NextResponse.json({ error: 'Invalid or expired session handoff' }, { status: 401 })
    const tokens = await result.json()
    if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string') {
      throw new Error('Invalid token response')
    }
    const response = NextResponse.redirect(new URL(returnPath, request.url), { status: 303 })
    const cookieOptions = getCookieOptions(request)
    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.access_token, { ...cookieOptions, maxAge: ACCESS_TOKEN_MAX_AGE })
    response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, { ...cookieOptions, maxAge: REFRESH_TOKEN_MAX_AGE })
    response.cookies.set('launchlms_has_session', '1', {
      ...cookieOptions, httpOnly: false, maxAge: REFRESH_TOKEN_MAX_AGE,
    })
    response.cookies.set(stateCookie, '', {
      httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax',
      path: '/', maxAge: 0,
    })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch {
    return NextResponse.json({ error: 'Session handoff unavailable' }, { status: 503 })
  }
}
