import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@services/config/config'
import { getDomainFromRequest, REFRESH_TOKEN_COOKIE } from '@services/auth/cookies'
import { isManagedHost, safeHandoffPath } from '@services/routing/handoff'

export const runtime = 'nodejs'

const BACKEND_URL = (process.env.LAUNCHLMS_INTERNAL_BACKEND_URL ||
  getConfig('NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL') || 'http://localhost:1338').replace(/\/+$/, '')
const SUBMIT_SCRIPT = 'document.forms[0].submit()'
const SCRIPT_HASH = createHash('sha256').update(SUBMIT_SCRIPT).digest('base64')

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character)
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('target') || ''
  const state = request.nextUrl.searchParams.get('state') || ''
  const returnPath = request.nextUrl.searchParams.get('return') || '/'
  const domain = getDomainFromRequest(request).domain
  if (getConfig('NEXT_PUBLIC_LAUNCHLMS_COOKIE_SCOPE', 'shared-domain') !== 'host-only' ||
      !isManagedHost(request.nextUrl.host, domain) || !isManagedHost(target, domain) ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(state) || !safeHandoffPath(returnPath)) {
    return NextResponse.json({ error: 'Invalid session handoff' }, { status: 400 })
  }
  const targetOrigin = `${request.nextUrl.protocol}//${target}`
  const loginUrl = new URL('/login', targetOrigin)
  loginUrl.searchParams.set('next', returnPath)
  const refresh = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value
  if (!refresh) return NextResponse.redirect(loginUrl)

  let ticket: string
  try {
    const result = await fetch(`${BACKEND_URL}/api/v1/auth/handoff/issue`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json', Cookie: `${REFRESH_TOKEN_COOKIE}=${refresh}`,
      },
      body: JSON.stringify({ target_host: target, state, return_path: returnPath }),
      cache: 'no-store', signal: AbortSignal.timeout(5000),
    })
    if (!result.ok) return NextResponse.redirect(loginUrl)
    const body = await result.json()
    if (typeof body.ticket !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(body.ticket)) {
      throw new Error('Invalid handoff ticket')
    }
    ticket = body.ticket
  } catch {
    return NextResponse.json({ error: 'Session handoff unavailable; sign in on the destination host.' }, { status: 503 })
  }

  const action = `${targetOrigin}/api/auth/handoff/complete`
  const html = `<!doctype html><html><head><meta name="referrer" content="no-referrer"></head>` +
    `<body><form method="post" action="${escapeHtml(action)}">` +
    `<input type="hidden" name="ticket" value="${escapeHtml(ticket)}">` +
    `<input type="hidden" name="state" value="${escapeHtml(state)}">` +
    `<input type="hidden" name="return_path" value="${escapeHtml(returnPath)}">` +
    `<button type="submit">Continue to organization</button></form>` +
    `<script>${SUBMIT_SCRIPT}</script></body></html>`
  return new NextResponse(html, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'none'; form-action ${targetOrigin}; script-src 'sha256-${SCRIPT_HASH}'; base-uri 'none'`,
    'X-Content-Type-Options': 'nosniff',
  } })
}
