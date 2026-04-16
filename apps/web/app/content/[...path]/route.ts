import { NextRequest, NextResponse } from 'next/server'
import { getBackendUrl } from '@services/config/config'

export const dynamic = 'force-dynamic'

const SKIP_RESPONSE_HEADERS = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length',
])

async function proxyContent(request: NextRequest): Promise<Response> {
  const internalBase = (
    process.env.LAUNCHLMS_INTERNAL_BACKEND_URL || getBackendUrl()
  ).replace(/\/+$/, '')

  const url = `${internalBase}${request.nextUrl.pathname}${request.nextUrl.search}`

  // Forward cookies so private content auth works
  const headers = new Headers()
  const cookie = request.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)

  try {
    const res = await fetch(url, { headers })

    const responseHeaders = new Headers()
    res.headers.forEach((value, key) => {
      if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value)
      }
    })

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    })
  } catch (error: any) {
    console.error(`Failed to proxy ${url}:`, error.message || error)
    return NextResponse.json({ error: 'Content unavailable' }, { status: 502 })
  }
}

export async function GET(request: NextRequest) {
  return proxyContent(request)
}

export async function HEAD(request: NextRequest) {
  return proxyContent(request)
}
