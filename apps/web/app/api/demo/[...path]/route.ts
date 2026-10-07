import { NextRequest, NextResponse } from 'next/server'
import { buildPublicRequestUrl } from '@services/routing/context'
import { getConfig } from '@services/config/config'
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@services/auth/cookies'

const BACKEND = (process.env.LAUNCHLMS_INTERNAL_BACKEND_URL || getConfig('NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL') || 'http://localhost:1338').replace(/\/+$/, '')
const PATHS = new Set(['status', 'ready', 'settings', 'checkpoints', 'admin/enter', 'admin/exit', 'start', 'reset', 'end', 'extend'])

async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace('/api/demo/', '')
  if (!PATHS.has(path)) return NextResponse.json({ detail: 'Unknown demo action' }, { status: 404 })
  const publicUrl = new URL(buildPublicRequestUrl(request.url, request.headers.get('host'), request.headers.get('x-forwarded-proto')))
  if (request.method !== 'GET' && request.headers.get('origin') !== publicUrl.origin) {
    return NextResponse.json({ detail: 'This action must come from the current site.' }, { status: 403 })
  }
  const options = { httpOnly: true, secure: publicUrl.protocol === 'https:', sameSite: 'lax' as const, path: '/' }
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  try {
    const upstream = await fetch(`${BACKEND}/api/v1/demo/${path}`, {
      method: request.method, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Cookie: `demo_visitor_cookie=${request.cookies.get('demo_visitor_cookie')?.value || ''}; demo_pending_cookie=${request.cookies.get('demo_pending_cookie')?.value || ''}`, ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Forwarded-Host': request.headers.get('host') || publicUrl.host,
        // Trusted proxy forwarding: preserve client identity for abuse accounting.
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown' },
      body: request.method === 'GET' ? undefined : await request.text(),
      signal: AbortSignal.timeout(path === 'checkpoints' || path === 'start' || path === 'reset' ? 120000 : 15000),
    })
    const data = await upstream.json()
    const response = NextResponse.json(data, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
    if (upstream.headers.has('retry-after')) response.headers.set('Retry-After', upstream.headers.get('retry-after')!)
    if (!upstream.ok) return response
    if (data.visitor_token) response.cookies.set('demo_visitor_cookie', data.visitor_token, { ...options, maxAge: 86400 })
    if (data.pending_token) {
      response.cookies.set('demo_pending_cookie', data.pending_token, { ...options, maxAge: 900 })
      for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, 'launchlms_has_session']) response.cookies.set(name, '', { ...options, maxAge: 0 })
    }
    if (data.tokens) {
      response.cookies.set('demo_pending_cookie', '', { ...options, maxAge: 0 })
      response.cookies.set(ACCESS_TOKEN_COOKIE, data.tokens.access_token, { ...options, maxAge: 2592000 })
      response.cookies.set(REFRESH_TOKEN_COOKIE, data.tokens.refresh_token, { ...options, maxAge: 2592000 })
      response.cookies.set('launchlms_has_session', '1', { ...options, httpOnly: false, maxAge: 2592000 })
    }
    if (path === 'end') {
      for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, 'launchlms_has_session', 'demo_pending_cookie']) {
        response.cookies.set(name, '', { ...options, httpOnly: name !== 'launchlms_has_session', maxAge: 0 })
      }
    }
    return response
  } catch {
    return NextResponse.json({ detail: 'The demo service is unavailable. Please try again shortly.' }, { status: 503 })
  }
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
