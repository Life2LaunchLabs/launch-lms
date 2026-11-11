import { NextRequest, NextResponse } from 'next/server'
import { getConfig } from '@services/config/config'
import { buildPublicRequestUrl } from '@services/routing/context'
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, getCookieOptions } from '@services/auth/cookies'
import { TEST_PERSONA_COOKIE, encodeTestPersonaMarker } from '@services/userTests/marker'

const BACKEND_URL = (process.env.LAUNCHLMS_INTERNAL_BACKEND_URL || getConfig('NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL') || 'http://localhost:1338').replace(/\/+$/, '')
// Persona sessions last four hours; the cookies never outlive them.
const SESSION_SECONDS = 4 * 60 * 60

/**
 * Spends a one-use login link made in Platform › User tests and signs this browser in as
 * that test persona, with the same cookie logic as the main auth proxy.
 */
export async function POST(request: NextRequest) {
  const publicUrl = new URL(buildPublicRequestUrl(request.url, request.headers.get('host'), request.headers.get('x-forwarded-proto')))
  if (request.headers.get('origin') !== publicUrl.origin) {
    return NextResponse.json({ detail: 'This action must come from the current site.' }, { status: 403 })
  }
  let ticket = ''
  try { ticket = String((await request.json())?.ticket || '') } catch { ticket = '' }
  if (!ticket || ticket.length > 200) return NextResponse.json({ detail: 'This login link is incomplete.' }, { status: 400 })
  try {
    const upstream = await fetch(`${BACKEND_URL}/api/v1/user_tests/redeem`, {
      method: 'POST', cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Host': request.headers.get('host') || publicUrl.host,
        // Trusted proxy forwarding: the backend rate-limits link redemptions per client.
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
      body: JSON.stringify({ ticket }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await upstream.json()
    if (!upstream.ok) return NextResponse.json({ detail: data?.detail || 'This login link did not work.' }, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
    const options = getCookieOptions(request)
    const response = NextResponse.json({ target_path: data.target_path, target_org_slug: data.target_org_slug || null, persona: data.persona, cohort: data.cohort }, { headers: { 'Cache-Control': 'no-store' } })
    response.cookies.set(ACCESS_TOKEN_COOKIE, data.tokens.access_token, { ...options, maxAge: SESSION_SECONDS })
    response.cookies.set(REFRESH_TOKEN_COOKIE, data.tokens.refresh_token, { ...options, maxAge: SESSION_SECONDS })
    response.cookies.set('launchlms_has_session', '1', { ...options, httpOnly: false, maxAge: SESSION_SECONDS })
    // Read by the persona banner, which shows only while this persona is the one signed in.
    const marker = encodeTestPersonaMarker({ userId: data.persona.user_id, name: data.persona.name, cohort: data.cohort.name })
    response.cookies.set(TEST_PERSONA_COOKIE, marker, { ...options, httpOnly: false, maxAge: SESSION_SECONDS })
    return response
  } catch {
    return NextResponse.json({ detail: 'User tests are unavailable right now. Try again shortly.' }, { status: 503 })
  }
}
