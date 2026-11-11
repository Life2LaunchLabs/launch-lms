import { errorDetailMessage } from '../../lib/errorDetail.ts'

const FALLBACK = 'The request could not be completed.'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// OAuth endpoints answer with RFC 6749 `{error, error_description}` bodies, but
// app-level checks (e.g. test personas) answer with FastAPI's `{detail}`.
export function oauthErrorMessage(body: unknown): string {
  return errorDetailMessage(body, FALLBACK)
}

export function oauthErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const { error, detail } = body as Record<string, unknown>
  if (text(error)) return error as string
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    return text((detail as Record<string, unknown>).code) || undefined
  }
  return undefined
}
