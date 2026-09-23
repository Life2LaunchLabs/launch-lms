import { NextResponse, type NextRequest } from 'next/server.js'
import { SERVER_AUTH_HEADERS, SESSION_COOKIE_NAMES } from '../auth/sessionCookies.ts'

/**
 * Carry the proxy-observed session into the rewritten Server Component request.
 * Some deployed Next.js topologies lose both cookies() and the Cookie header at
 * this boundary. Client-supplied bridge headers are always removed first; the
 * API still validates every token before treating it as authenticated.
 */
export function rewriteWithRequestHeaders(request: NextRequest, destination: string): NextResponse {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete(SERVER_AUTH_HEADERS.accessToken)
  requestHeaders.delete(SERVER_AUTH_HEADERS.refreshToken)

  const accessToken = request.cookies.get(SESSION_COOKIE_NAMES.accessToken)?.value
  const refreshToken = request.cookies.get(SESSION_COOKIE_NAMES.refreshToken)?.value
  if (accessToken) requestHeaders.set(SERVER_AUTH_HEADERS.accessToken, accessToken)
  if (refreshToken) requestHeaders.set(SERVER_AUTH_HEADERS.refreshToken, refreshToken)

  return NextResponse.rewrite(new URL(destination, request.url), {
    request: { headers: requestHeaders },
  })
}
