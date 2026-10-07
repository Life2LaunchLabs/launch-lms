export type DemoSettings = {
  revision: number
  enabled: boolean
  auto_recapture: boolean
  recapture_error?: string | null
  entry_org_id: number | null
  entry_org_slug?: string
  capacity: number
  session_minutes: number
  extension_minutes: number
  ai_requests_per_minute: number
  ai_tokens_per_visitor: number
  ai_tokens_per_day: number
}
export type DemoAccount = {
  user_id: number
  first_name: string
  last_name: string
  username: string
  description: string
  has_avatar?: boolean
}
export type DemoMember = DemoAccount & { user_email: string; pilotable: boolean }
export type DemoStatus = {
  mode: 'public' | 'operator' | 'admin' | 'visitor'
  accounts?: DemoAccount[]
  members?: DemoMember[]
  pilot_user_id?: number
  available?: boolean
  preparing?: boolean
  ready_workspaces?: number
  expires_at?: string
  checkpoint_id?: string | null
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

export async function waitForDemo(signal: AbortSignal): Promise<{ entry_org_slug: string }> {
  while (!signal.aborted) {
    const result = await demoRequest<{ preparing?: boolean; tokens?: { entry_org_slug: string } }>('ready', 'GET', undefined, signal)
    if (result.tokens) return result.tokens
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
  }
  throw new DOMException('Preparation cancelled', 'AbortError')
}

export function demoAvatarUrl(checkpointId: string | null | undefined, account: Pick<DemoAccount, 'user_id' | 'has_avatar'>): string | null {
  return checkpointId && account.has_avatar ? `/api/demo/portraits/${checkpointId}/${account.user_id}` : null
}

export function demoAccountName(account: Pick<DemoAccount, 'first_name' | 'last_name' | 'username'>): string {
  return `${account.first_name} ${account.last_name}`.trim() || account.username
}

export function announceDemoSetupChange(): void {
  window.dispatchEvent(new Event('demo-setup-changed'))
}
