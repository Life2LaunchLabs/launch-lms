import { NextRequest, NextResponse } from 'next/server'
import http from 'node:http'
import https from 'node:https'
import { getBackendUrl } from '@services/config/config'

// Allow large file uploads (videos, SCORM packages) to pass through
export const maxDuration = 300 // 5 minutes
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Headers to skip when forwarding (hop-by-hop or Next.js internal)
const SKIP_REQUEST_HEADERS = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding'])
// Node.js fetch auto-decompresses responses, so we must strip encoding headers
// to avoid browsers trying to decompress an already-decompressed body
const SKIP_RESPONSE_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length'])

async function proxyMultipartViaNode(
  backendUrl: string,
  method: string,
  headers: Headers,
  bytes: Uint8Array,
  redirectCount: number = 0
): Promise<Response> {
  const url = new URL(backendUrl)
  const client = url.protocol === 'https:' ? https : http
  const requestHeaders = Object.fromEntries(headers.entries())

  return new Promise((resolve, reject) => {
    const upstream = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers: requestHeaders,
      },
      (backendResponse) => {
        const location = backendResponse.headers.location
        const statusCode = backendResponse.statusCode || 0

        if (location && [301, 302, 307, 308].includes(statusCode) && redirectCount < 3) {
          const redirectedUrl = new URL(location, url)
          if (
            redirectedUrl.hostname === url.hostname &&
            redirectedUrl.port === url.port
          ) {
            redirectedUrl.protocol = url.protocol
          }

          resolve(proxyMultipartViaNode(redirectedUrl.toString(), method, headers, bytes, redirectCount + 1))
          return
        }

        const chunks: Buffer[] = []

        backendResponse.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })

        backendResponse.on('end', () => {
          const responseHeaders = new Headers()
          Object.entries(backendResponse.headers).forEach(([key, value]) => {
            if (!value || SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) return
            if (Array.isArray(value)) {
              value.forEach((item) => responseHeaders.append(key, item))
            } else {
              responseHeaders.set(key, value)
            }
          })

          resolve(
            new Response(Buffer.concat(chunks), {
              status: backendResponse.statusCode || 502,
              statusText: backendResponse.statusMessage,
              headers: responseHeaders,
            })
          )
        })
      }
    )

    upstream.on('error', reject)
    upstream.write(Buffer.from(bytes))
    upstream.end()
  })
}

async function proxyToBackend(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.pathname
  const search = request.nextUrl.search
  const backendBase = (process.env.LAUNCHLMS_INTERNAL_BACKEND_URL || getBackendUrl()).replace(/\/+$/, '')
  const backendUrl = `${backendBase}${path}${search}`

  // Forward all request headers except hop-by-hop ones
  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!SKIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  })

  // Most requests can be streamed through as-is. Multipart form uploads are a
  // special case under the same-origin proxy path: FastAPI parses them
  // correctly when we preserve the raw browser bytes and boundary, but not when
  // we rebuild them as a new FormData object in Node.
  let body: BodyInit | undefined
  let useDuplex = false
  let multipartBytes: Uint8Array | null = null

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const bytes = new Uint8Array(await request.arrayBuffer())
      multipartBytes = bytes
      const multipartHeaders = new Headers()
      const authorization = request.headers.get('authorization')
      const cookie = request.headers.get('cookie')
      const accept = request.headers.get('accept')
      const userAgent = request.headers.get('user-agent')

      if (authorization) multipartHeaders.set('authorization', authorization)
      if (cookie) multipartHeaders.set('cookie', cookie)
      if (accept) multipartHeaders.set('accept', accept)
      if (userAgent) multipartHeaders.set('user-agent', userAgent)
      multipartHeaders.set('content-type', contentType)
      multipartHeaders.set('content-length', String(bytes.byteLength))

      headers.forEach((_value, key) => headers.delete(key))
      multipartHeaders.forEach((value, key) => headers.set(key, value))

      headers.set('content-length', String(bytes.byteLength))
      body = bytes
    } else {
      body = request.body ?? undefined
      useDuplex = body !== undefined
    }
  }

  try {
    if (multipartBytes) {
      return await proxyMultipartViaNode(backendUrl, request.method, headers, multipartBytes)
    }

    const backendResponse = await fetch(backendUrl, {
      method: request.method,
      headers,
      body,
      ...(useDuplex
        ? {
            // @ts-ignore — needed for streaming request bodies in Node.js
            duplex: 'half',
          }
        : {}),
    })

    // Build response headers, forwarding everything from backend
    const responseHeaders = new Headers()
    backendResponse.headers.forEach((value, key) => {
      if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.append(key, value)
      }
    })

    // Stream the response body directly — no buffering
    // This preserves SSE streams, file downloads, and binary responses
    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    })
  } catch (error: any) {
    console.error(`Failed to proxy ${backendUrl}:`, error.message || error)
    return NextResponse.json(
      {
        error: 'Backend unavailable',
        detail: String(error?.cause || error?.message || error),
        backendUrl,
      },
      { status: 502 }
    )
  }
}

export async function GET(request: NextRequest) {
  return proxyToBackend(request)
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request)
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request)
}

export async function PATCH(request: NextRequest) {
  return proxyToBackend(request)
}

export async function DELETE(request: NextRequest) {
  return proxyToBackend(request)
}
