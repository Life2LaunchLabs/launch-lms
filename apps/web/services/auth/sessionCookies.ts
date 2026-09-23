type SessionCookieValues = {
  accessToken?: string | null
  refreshToken?: string | null
}

export function cookieValueFromHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=')
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue

    const value = cookie.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  return undefined
}

export function resolveRequestCookie(
  cookieStoreValue: string | undefined,
  cookieHeader: string | null,
  name: string
): string | undefined {
  return cookieStoreValue || cookieValueFromHeader(cookieHeader, name)
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function isUnexpiredJwt(token: string | null | undefined, nowSeconds = Date.now() / 1000): boolean {
  if (!token) return false
  const expiry = decodeJwtPayload(token)?.exp
  return typeof expiry === 'number' && expiry > nowSeconds
}

/**
 * Routing only needs to know whether a request can plausibly recover a session.
 * Authentication and signature verification remain the responsibility of the API.
 */
export function hasRoutableSession(
  { accessToken, refreshToken }: SessionCookieValues,
  nowSeconds = Date.now() / 1000
): boolean {
  return [accessToken, refreshToken].some(token => isUnexpiredJwt(token, nowSeconds))
}
