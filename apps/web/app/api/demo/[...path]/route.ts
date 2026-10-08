import { NextRequest, NextResponse } from 'next/server'
import { buildPublicRequestUrl } from '@services/routing/context'
import { getConfig } from '@services/config/config'
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, getCookieDomain } from '@services/auth/cookies'

const BACKEND = (process.env.LAUNCHLMS_INTERNAL_BACKEND_URL || getConfig('NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL') || 'http://localhost:1338').replace(/\/+$/, '')
const PATHS = new Set(['status', 'ready', 'settings', 'users', 'users/existing', 'preflight', 'checkpoints', 'admin/enter', 'admin/exit', 'start', 'reset', 'end', 'extend', 'guide', 'announcements', 'feedback'])
const DYNAMIC = [/^users\/\d+$/, /^checkpoints\/[0-9a-f]{32}\/restore$/]

const PORTRAIT = /^portraits\/[0-9a-f]{32}\/\d+$/

async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace('/api/demo/', '')
  if (request.method === 'GET' && PORTRAIT.test(path)) {
    // Checkpoint ids are immutable, so published portraits cache indefinitely.
    try {
      const image = await fetch(`${BACKEND}/api/v1/demo/${path}`, { signal: AbortSignal.timeout(15000) })
      if (!image.ok) return new NextResponse(null, { status: image.status })
      return new NextResponse(await image.arrayBuffer(), { headers: { 'Content-Type': image.headers.get('content-type') || 'image/png', 'Cache-Control': image.headers.get('cache-control') || 'no-store', 'X-Content-Type-Options': 'nosniff' } })
    } catch { return new NextResponse(null, { status: 503 }) }
  }
  if (!PATHS.has(path) && !DYNAMIC.some((pattern) => pattern.test(path))) return NextResponse.json({ detail: 'Unknown demo action' }, { status: 404 })
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
      signal: AbortSignal.timeout(['checkpoints', 'preflight', 'start', 'reset', 'users'].includes(path) ? 120000 : 15000),
    })
    const data = await upstream.json()
    const response = NextResponse.json(data, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
    if (upstream.headers.has('retry-after')) response.headers.set('Retry-After', upstream.headers.get('retry-after')!)
    if (!upstream.ok) return response
    if (data.visitor_token) response.cookies.set('demo_visitor_cookie', data.visitor_token, { ...options, maxAge: 86400 })
    if (data.pending_token) {
      response.cookies.set('demo_pending_cookie', data.pending_token, { ...options, maxAge: 900 })
      for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, 'launchlms_has_session']) response.cookies.set(name, '', { ...options, maxAge: 0 })
      // A live login shared across subdomains would otherwise reach the demo host too and
      // shadow the visitor's host-only cookie. Starting a demo signs that login out.
      const shared = getCookieDomain(request)
      if (shared) {
        const secure = options.secure ? '; Secure' : ''
        for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, 'launchlms_has_session']) response.headers.append('Set-Cookie', `${name}=; Path=/; Domain=${shared}; Max-Age=0; SameSite=Lax${secure}`)
      }
    }
    if (data.tokens) {
      // Setup mode replaces the admin's own login, so it uses the same shared cookie scope;
      // visitor copies stay host-only on the demo host.
      const domain = path.startsWith('admin/') ? getCookieDomain(request) : undefined
      const scoped = domain ? { ...options, domain } : options
      response.cookies.set('demo_pending_cookie', '', { ...options, maxAge: 0 })
      response.cookies.set(ACCESS_TOKEN_COOKIE, data.tokens.access_token, { ...scoped, maxAge: 2592000 })
      response.cookies.set(REFRESH_TOKEN_COOKIE, data.tokens.refresh_token, { ...scoped, maxAge: 2592000 })
      response.cookies.set('launchlms_has_session', '1', { ...scoped, httpOnly: false, maxAge: 2592000 })
      if (domain) {
        // Drop any host-only copy so the shared cookie is the only one sent.
        // Appended last: cookies.set() rewrites the Set-Cookie headers it manages.
        const secure = options.secure ? '; Secure' : ''
        for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) response.headers.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`)
      }
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
export const PATCH = proxy
export const DELETE = proxy
