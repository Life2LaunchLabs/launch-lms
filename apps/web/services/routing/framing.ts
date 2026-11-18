/**
 * Who may show our pages in a frame (DEV-174). An organization's pages allow only the Canvas sites of its
 * switched-on Canvas connection; the main site allows every switched-on Canvas, since that's where each
 * school's learners land. Everything else: only ourselves. Page routing (proxy.ts) sets it per request.
 */
const TTL_MS = 60 * 1000
const cache = new Map<string, { origins: string[]; ts: number }>()

export function frameAncestors(origins: string[]): string {
  const safe = origins.filter((origin) => /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/.test(origin))
  return ["frame-ancestors 'self'", ...safe].join(' ')
}

export async function framingOrigins(apiUrl: string, orgSlug: string | null): Promise<string[]> {
  const key = orgSlug || ''
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.origins
  try {
    const res = await fetch(`${apiUrl}lti/framing?org=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      const body = await res.json()
      const origins = Array.isArray(body?.origins) ? body.origins.filter((o: unknown) => typeof o === 'string') : []
      cache.set(key, { origins, ts: Date.now() })
      return origins
    }
  } catch {
    // The API is unreachable: fall back to the last answer, else to our own site only.
  }
  return hit?.origins || []
}
