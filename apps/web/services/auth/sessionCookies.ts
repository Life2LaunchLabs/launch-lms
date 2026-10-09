type SessionCookieValues = {
  accessToken?: string | null
  refreshToken?: string | null
}

export const SESSION_COOKIE_NAMES = {
  accessToken: 'access_token_cookie',
  refreshToken: 'refresh_token_cookie',
} as const

export const SERVER_AUTH_HEADERS = {
  accessToken: 'x-launchlms-access-token',
  refreshToken: 'x-launchlms-refresh-token',
} as const

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
