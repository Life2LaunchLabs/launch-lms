import { NextRequest } from 'next/server'
import { getBackendUrl } from '@services/config/config'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 300

const SKIP_REQUEST_HEADERS = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding'])
const SKIP_RESPONSE_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length'])

async function proxyContent(request: NextRequest): Promise<Response> {
  const backendBase = (process.env.LAUNCHLMS_INTERNAL_BACKEND_URL || getBackendUrl()).replace(/\/+$/, '')
  const backendUrl = `${backendBase}${request.nextUrl.pathname}${request.nextUrl.search}`

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!SKIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  })

  const response = await fetch(backendUrl, {
    method: request.method,
    headers,
    redirect: 'manual',
  })

  const responseHeaders = new Headers()
  response.headers.forEach((value, key) => {
    if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.append(key, value)
    }
  })

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}

export async function GET(request: NextRequest) {
  return proxyContent(request)
}

export async function HEAD(request: NextRequest) {
  return proxyContent(request)
}
