import { cookies, headers } from 'next/headers'
import { getServerAPIUrl } from '@services/config/config'
import { isUnexpiredJwt, SERVER_AUTH_HEADERS, SESSION_COOKIE_NAMES } from '@services/auth/sessionCookies'

const API_URL = getServerAPIUrl().replace(/\/+$/, '')

// Cookie names (must match the API routes)
const ACCESS_TOKEN_COOKIE = SESSION_COOKIE_NAMES.accessToken
const REFRESH_TOKEN_COOKIE = SESSION_COOKIE_NAMES.refreshToken

async function getServerCookieValues(): Promise<{
  accessToken?: string
  refreshToken?: string
}> {
  const cookieStore = await cookies()
  const storedAccessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value
  const storedRefreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value

  if (storedAccessToken && storedRefreshToken) {
    return { accessToken: storedAccessToken, refreshToken: storedRefreshToken }
  }

  // The organization-route proxy owns these bridge headers: it removes any
  // client values, then repopulates them only from cookies observed at the
  // public request boundary. The API remains responsible for token validation.
  const requestHeaders = await headers()
  return {
    accessToken: storedAccessToken || requestHeaders.get(SERVER_AUTH_HEADERS.accessToken) || undefined,
    refreshToken: storedRefreshToken || requestHeaders.get(SERVER_AUTH_HEADERS.refreshToken) || undefined,
  }
}

// Types matching the client-side session structure
export interface Session {
  user: any | undefined
  roles?: any[] | undefined
  tokens?: {
    access_token?: string | undefined
    refresh_token?: string | undefined
    expiry?: number | undefined
  } | undefined
}

/**
 * Get server-side session by reading tokens from cookies.
 *
 * Since cookies are now set by Next.js API routes (same origin),
 * they are reliably readable by the Next.js server.
 */
export async function getServerSession(): Promise<Session | null> {
  try {
    const { accessToken, refreshToken } = await getServerCookieValues()

    // Try to get access token directly
    if (accessToken) {
      // Verify the token is valid by fetching session from backend
      const sessionResponse = await fetch(`${API_URL}/users/session`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      })

      if (sessionResponse.ok) {
        const sessionData = await sessionResponse.json()
        return {
          user: sessionData.user,
          roles: sessionData.roles,
          tokens: {
            access_token: accessToken,
          },
        }
      }

      // Access token expired or invalid, try refresh
    }

    // Try to refresh using refresh token
    if (!refreshToken) {
      return null
    }

    // Exchange refresh token for new access token via backend
    const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
      method: 'GET',
      headers: {
        Cookie: `${REFRESH_TOKEN_COOKIE}=${refreshToken}`,
      },
      cache: 'no-store',
    })

    if (!refreshResponse.ok) {
      return null
    }

    const refreshData = await refreshResponse.json()

    if (!refreshData.access_token) {
      return null
    }

    // Fetch user session with the new access token
    const sessionResponse = await fetch(`${API_URL}/users/session`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${refreshData.access_token}`,
      },
      cache: 'no-store',
    })

    if (!sessionResponse.ok) {
      return null
    }

    const sessionData = await sessionResponse.json()

    return {
      user: sessionData.user,
      roles: sessionData.roles,
      tokens: {
        access_token: refreshData.access_token,
        expiry: refreshData.expiry,
      },
    }
  } catch (error) {
    console.error('[SERVER_SESSION] Error:', error)
    return null
  }
}

/**
 * Get access token from cookies for server-side API calls.
 * This is a lightweight alternative when you only need the token.
 */
export async function getServerAccessToken(): Promise<string | null> {
  try {
    const { accessToken, refreshToken } = await getServerCookieValues()

    // Try access token first
    if (accessToken && isUnexpiredJwt(accessToken)) {
      return accessToken
    }

    // Try to refresh
    if (!refreshToken) {
      return null
    }

    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'GET',
      headers: {
        Cookie: `${REFRESH_TOKEN_COOKIE}=${refreshToken}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.access_token || null
  } catch (error) {
    console.error('[SERVER_SESSION] Error getting access token:', error)
    return null
  }
}
