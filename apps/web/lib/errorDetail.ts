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

/**
 * The message for a refused request (DEV-189). The server's own reason wins.
 * Without one, only answers that can pass on a retry (server trouble, rate
 * limits, timeouts, no status at all) say "try again"; a refusal that would
 * be refused again says so instead.
 */
export function refusalMessage(status: number, body: unknown, action: string = 'That didn’t save'): string {
  const reason = errorDetailMessage(body, '')
  if (reason) return reason
  if (!status || status >= 500 || status === 408 || status === 429) return `${action}. Try again in a moment.`
  if (status === 401) return `${action}: you’re signed out. Sign in again and retry.`
  if (status === 403) return `${action}: your account isn’t allowed to make this change.`
  return `${action}: the server refused it (error ${status}).`
}
