const FALLBACK = 'The request could not be completed.'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * The readable message in an API error body. FastAPI answers with `{detail}`,
 * where detail can be a string, a `{code, message}` object (e.g. the test
 * cohort seal) or a validation error list; OAuth answers with
 * `{error_description}`. Never returns "[object Object]".
 */
export function errorDetailMessage(body: unknown, fallback: string = FALLBACK): string {
  if (!body || typeof body !== 'object') return fallback
  const { error_description, detail, message } = body as Record<string, unknown>
  const direct = text(error_description) || text(detail)
  if (direct) return direct
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    return text((detail as Record<string, unknown>).message) || fallback
  }
  if (Array.isArray(detail)) {
    const first = detail.find((item) => text((item as any)?.msg))
    return first ? (text((first as any).msg) as string) : fallback
  }
  return text(message) || fallback
}
