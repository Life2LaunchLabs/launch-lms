import { NextResponse, type NextRequest } from 'next/server.js'

/**
 * Keep the original request headers available after an internal organization
 * rewrite. In some proxy topologies Next's implicit rewrite path does not carry
 * the Cookie header into the Server Component request, even though Proxy saw it.
 * The request override is internal; these headers are not exposed on the client
 * response.
 */
export function rewriteWithRequestHeaders(request: NextRequest, destination: string): NextResponse {
  return NextResponse.rewrite(new URL(destination, request.url), {
    request: { headers: new Headers(request.headers) },
  })
}
