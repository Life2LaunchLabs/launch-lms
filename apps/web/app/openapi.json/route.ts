import { NextResponse } from 'next/server'
import { getBackendUrl } from '@services/config/config'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  const backendUrl = `${getBackendUrl().replace(/\/+$/, '')}/openapi.json`

  try {
    const response = await fetch(backendUrl, {
      method: 'GET',
      cache: 'no-store',
    })

    const body = await response.text()

    return new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to fetch OpenAPI spec',
        detail: String(error?.message || error),
      },
      { status: 502 }
    )
  }
}
