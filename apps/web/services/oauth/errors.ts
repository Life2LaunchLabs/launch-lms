const FALLBACK = 'The request could not be completed.'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// OAuth endpoints answer with RFC 6749 `{error, error_description}` bodies, but
// app-level checks (e.g. test personas) answer with FastAPI's `{detail}`, where
// detail can be a string, `{code, message}` or a validation error list.
export function oauthErrorMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return FALLBACK
  const { error_description, detail } = body as Record<string, unknown>
  const direct = text(error_description) || text(detail)
  if (direct) return direct
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    return text((detail as Record<string, unknown>).message) || FALLBACK
  }
  if (Array.isArray(detail)) {
    const first = detail.find((item) => text((item as any)?.msg))
    if (first) return text((first as any).msg) as string
  }
  return FALLBACK
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
