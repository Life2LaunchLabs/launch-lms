import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getConfig } from '@services/config/config'
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_MAX_AGE,
  cookieAttributeSuffix,
  getCookieDomain,
  getCookieOptions,
  isCanvasSession,
  isSameOriginRequest,
} from '@services/auth/cookies'
import { CANVAS_SESSION_COOKIE } from '@services/auth/sessionCookies'
import { ROUTING_COOKIES } from '@services/routing/cookies'
import { TEST_INVITEE_COOKIE, TEST_PERSONA_COOKIE, encodeTestPersonaMarker } from '@services/userTests/marker'

const BACKEND_URL = (process.env.LAUNCHLMS_INTERNAL_BACKEND_URL || getConfig('NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL') || 'http://localhost:1338').replace(/\/+$/, '')

// Paths that return tokens in response body (relative to /api/v1/auth/)
const TOKEN_RESPONSE_PATHS = ['login', 'refresh', 'oauth', 'signup', 'change-email']

function shouldExtractTokens(path: string): boolean {
  return TOKEN_RESPONSE_PATHS.some(p => path.startsWith(p))
}

function isDemoToken(token?: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token?.split('.')[1] || '', 'base64url').toString())
    // Visitor copies stay on the demo host. Setup mode is an admin session, shared like a login.
    return Boolean(payload.demo_session)
  } catch { return false }
}

async function proxyRequest(
  request: NextRequest,
  method: string
): Promise<NextResponse> {
  // Extract the path after /api/auth/
  const pathSegments = request.nextUrl.pathname.replace('/api/auth/', '')
  const search = request.nextUrl.search

  // Map to backend URL: /api/auth/login -> /api/v1/auth/login
  const backendUrl = `${BACKEND_URL}/api/v1/auth/${pathSegments}${search}`

  // A Canvas session's cookies are SameSite=None, so another site's form could post here with them.
  // Lax cookies used to stop that for free; for these, a changing request must come from this site.
  if (method !== 'GET' && method !== 'HEAD' && isCanvasSession(request) && !isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-site request refused' }, { status: 403 })
  }

  // Build headers
  const headers: HeadersInit = {}
  headers['X-Forwarded-Host'] = request.headers.get('host') || ''
  const cookieStore = await cookies()

  // Forward content-type
  const contentType = request.headers.get('content-type')
  if (contentType) {
    headers['Content-Type'] = contentType
  }

  // Forward authorization header if present
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    headers['Authorization'] = authHeader
  }

  // Forward cookies to backend
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)

  // Short-circuit: no refresh token cookie means nothing to refresh
  if (pathSegments === 'refresh' && !refreshToken?.value) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
  }

  // Handle logout locally — clear cookies and return 200
  // Try backend invalidation but don't fail if it errors
  if (pathSegments === 'logout' || pathSegments.endsWith('/logout')) {
    // Best-effort backend token invalidation
    try {
      const logoutHeaders: HeadersInit = {}
      if (accessToken?.value) logoutHeaders['Authorization'] = `Bearer ${accessToken.value}`
      if (refreshToken?.value) {
        logoutHeaders['Cookie'] = `${REFRESH_TOKEN_COOKIE}=${refreshToken.value}`
      }
      await fetch(`${BACKEND_URL}/api/v1/auth/logout`, {
        method: 'DELETE',
        headers: logoutHeaders,
        signal: AbortSignal.timeout(3000),
      }).catch(() => {})
    } catch {
      // Backend logout failed — that's fine, cookies are cleared below
    }

    const response = NextResponse.json({ ok: true })
    const isSecure = request.nextUrl.protocol === 'https:'
    const domain = isDemoToken(accessToken?.value) || isDemoToken(refreshToken?.value) ? undefined : getCookieDomain(request)
    // A Canvas session's cookies are partitioned: only a clear that says Partitioned (and SameSite=None) removes them.
    const attributes = cookieAttributeSuffix(request, isSecure)
    const names: [string, boolean][] = [
      [ACCESS_TOKEN_COOKIE, true], [REFRESH_TOKEN_COOKIE, true], ['launchlms_has_session', false],
      [ROUTING_COOKIES.orgSlug, false], [ROUTING_COOKIES.legacyOrgSlug, false], [ROUTING_COOKIES.customDomain, false],
      ...(isCanvasSession(request) ? [[CANVAS_SESSION_COOKIE, false] as [string, boolean]] : []),
    ]

    // Clear domain-scoped cookies (the ones set during login on subdomains)
    if (domain) {
      for (const [name, httpOnly] of names) {
        response.headers.append('Set-Cookie', `${name}=; Path=/; Domain=${domain}; Max-Age=0${httpOnly ? '; HttpOnly' : ''}${attributes}`)
      }
    }
    // Clear host-only cookies (pre-existing or custom domain cookies)
    for (const [name, httpOnly] of names) {
      response.headers.append('Set-Cookie', `${name}=; Path=/; Max-Age=0${httpOnly ? '; HttpOnly' : ''}${attributes}`)
    }

    return response
  }

  const cookieParts: string[] = []
  if (accessToken?.value) {
    cookieParts.push(`${ACCESS_TOKEN_COOKIE}=${accessToken.value}`)
  }
  if (refreshToken?.value) {
    cookieParts.push(`${REFRESH_TOKEN_COOKIE}=${refreshToken.value}`)
  }
  // A browser the user test console opened for an invitee: sign-up with their address makes them a persona (DEV-103).
  const inviteeCookie = cookieStore.get(TEST_INVITEE_COOKIE)
  if (inviteeCookie?.value && pathSegments.startsWith('signup')) {
    cookieParts.push(`${TEST_INVITEE_COOKIE}=${inviteeCookie.value}`)
  }
  if (cookieParts.length > 0) {
    headers['Cookie'] = cookieParts.join('; ')
  }

  // Get request body for non-GET requests
  let body: BodyInit | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    if (contentType?.includes('application/json')) {
      body = JSON.stringify(await request.json())
    } else if (contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      const params = new URLSearchParams()
      formData.forEach((value, key) => {
        params.append(key, value.toString())
      })
      body = params.toString()
    } else if (contentType?.includes('multipart/form-data')) {
      delete headers['Content-Type']
      body = await request.formData()
    } else {
      body = await request.text()
    }
  }

  // Make the request to backend
  const backendResponse = await fetch(backendUrl, {
    method,
    headers,
    body,
  })

  // Get response data
  const responseContentType = backendResponse.headers.get('content-type')
  let responseData: any
  let responseBody: BodyInit

  if (responseContentType?.includes('application/json')) {
    responseData = await backendResponse.json()
    responseBody = JSON.stringify(responseData)
  } else {
    responseBody = await backendResponse.text()
  }

  // Create response
  const response = new NextResponse(responseBody, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
  })

  // Copy relevant headers
  if (responseContentType) {
    response.headers.set('content-type', responseContentType)
  }

  // Extract and set auth cookies if this is a token-returning endpoint
  if (backendResponse.ok && shouldExtractTokens(pathSegments) && responseData) {
    // Handle different response structures
    const tokens = responseData.tokens || responseData
    const cookieOptions = getCookieOptions(request)
    if (isDemoToken(tokens.access_token) || isDemoToken(tokens.refresh_token)) {
      delete cookieOptions.domain
      cookieOptions.secure = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto')?.split(',')[0] === 'https'
    }

    if (tokens.access_token) {
      response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.access_token, {
        ...cookieOptions,
        maxAge: ACCESS_TOKEN_MAX_AGE,
      })
    }

    if (tokens.refresh_token) {
      response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, {
        ...cookieOptions,
        maxAge: REFRESH_TOKEN_MAX_AGE,
      })
    }

    // Set a non-httpOnly marker so the client knows a session exists
    // without making a network request (the actual tokens stay httpOnly)
    if (tokens.access_token || tokens.refresh_token) {
      response.cookies.set('launchlms_has_session', '1', {
        ...cookieOptions,
        httpOnly: false,
        maxAge: REFRESH_TOKEN_MAX_AGE,
      })
    }

    // An invitee just signed up and is now a test persona: show its banner and drop the sign-up cookie.
    const persona = responseData.test_persona
    if (persona?.user_id) {
      const maxAge = Number(persona.seconds) || 4 * 60 * 60
      response.cookies.set(TEST_PERSONA_COOKIE, encodeTestPersonaMarker({ userId: persona.user_id, name: persona.name, cohort: persona.cohort }), { ...cookieOptions, httpOnly: false, maxAge })
      response.cookies.set(TEST_INVITEE_COOKIE, '', { ...cookieOptions, maxAge: 0 })
    }
  }

  return response
}

export async function GET(request: NextRequest) {
  return proxyRequest(request, 'GET')
}

export async function POST(request: NextRequest) {
  return proxyRequest(request, 'POST')
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request, 'PUT')
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request, 'PATCH')
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request, 'DELETE')
}
