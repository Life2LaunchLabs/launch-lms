export type DemoSettings = {
  revision: number
  enabled: boolean
  source_user_id: number | null
  entry_org_id: number | null
  source_user_email?: string
  entry_org_slug?: string
  capacity: number
  session_minutes: number
  extension_minutes: number
  ai_requests_per_minute: number
  ai_tokens_per_visitor: number
  ai_tokens_per_day: number
}
export type DemoStatus = {
  mode: 'public' | 'operator' | 'admin' | 'visitor'
  available?: boolean
  preparing?: boolean
  ready_workspaces?: number
  expires_at?: string
  checkpoint_id?: string
  published_at?: string | null
  settings?: DemoSettings
}

export class DemoRequestError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function demoRequest<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/demo/${path}`, {
    method, credentials: 'include', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new DemoRequestError(typeof data.detail === 'string' ? data.detail : 'The demo request failed. Please try again.', response.status)
  return data as T
}

export async function waitForDemo(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    const result = await demoRequest<{ preparing?: boolean; tokens?: unknown }>('ready', 'GET', undefined, signal)
    if (result.tokens) return
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
  }
  throw new DOMException('Preparation cancelled', 'AbortError')
}
