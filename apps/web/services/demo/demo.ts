import { useSyncExternalStore } from 'react'

export type DemoSettings = {
  revision: number
  enabled: boolean
  auto_recapture: boolean
  recapture_error?: string | null
  capacity: number
  session_minutes: number
  extension_minutes: number
  ai_requests_per_minute: number
  ai_tokens_per_visitor: number
  ai_tokens_per_day: number
  checkpoint_id?: string | null
}
export type DemoJourney = {
  id: string
  title: string
  minutes?: number | null
  why: string
  steps: string[]
  link_label: string
  link_path: string
}
export type DemoGuide = { goals: string[]; has: string[]; journeys: DemoJourney[] }
export type DemoAccount = {
  user_id: number
  first_name: string
  last_name: string
  username: string
  description: string
  role_line?: string
  handle?: string | null
  journeys?: string[]
  has_avatar?: boolean
}
export type DemoOrgMembership = { slug: string; name: string; role_id: number }
export type DemoMember = DemoAccount & {
  user_email: string
  user_uuid: string
  avatar_image: string
  pilotable: boolean
  start_path: string
  start_org_slug: string
  guide: Partial<DemoGuide>
  position: number
  orgs: DemoOrgMembership[]
  changed: boolean
  last_setup_at: string | null
}
export type DemoPilot = DemoAccount & { start_path?: string; start_org_slug?: string }
export type DemoStatus = {
  mode: 'public' | 'operator' | 'admin' | 'visitor'
  accounts?: DemoAccount[]
  members?: DemoMember[]
  pilot_user_id?: number
  pilot?: DemoPilot
  setup_user_id?: number | null
  main_org_slug?: string
  available?: boolean
  preparing?: boolean
  ready_workspaces?: number
  preparation_error?: string | null
  active_sessions?: number
  expires_at?: string
  checkpoint_id?: string | null
  published_at?: string | null
  settings?: DemoSettings
  start_path?: string
  start_org_slug?: string
  tag?: string | null
  unstable?: boolean
  feedback_configured?: boolean
  revision?: string
}
export type DemoTokens = { entry_org_slug: string; start_path?: string; start_org_slug?: string }
export type DemoWarning = { kind: string; message: string; path?: string; table?: string | null; user_id?: number }
export type DemoPreflight = {
  ok: boolean
  error: string | null
  users: { user_id: number; name: string; badges: number; badge_runs: number; projects: number; plans: number; conversations: number }[]
  warnings: DemoWarning[]
  records?: number
  files?: number
  bytes?: number
  organizations?: string[]
}
export type DemoVersion = { id: string; published_at: string; published_by: string; current: boolean; compatible: boolean }
export type DemoAnnouncement = { id: string; title: string; message: string; published_at: string }

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
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail
      : Array.isArray(data.detail) && data.detail[0]?.msg ? String(data.detail[0].msg).replace(/^Value error, /, '')
        : 'The demo request failed. Please try again.'
    throw new DemoRequestError(detail, response.status)
  }
  return data as T
}

export async function waitForDemo(signal: AbortSignal): Promise<DemoTokens> {
  while (!signal.aborted) {
    const result = await demoRequest<{ preparing?: boolean; tokens?: DemoTokens }>('ready', 'GET', undefined, signal)
    if (result.tokens) return result.tokens
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
  }
  throw new DOMException('Preparation cancelled', 'AbortError')
}

/** Where a demo user lands: their start page, on the main portal unless an org is named. */
export function demoStartPath(tokens: Pick<DemoTokens, 'start_path' | 'start_org_slug'>): string {
  const path = tokens.start_path || '/hub'
  return tokens.start_org_slug ? `/orgs/${encodeURIComponent(tokens.start_org_slug)}${path}` : path
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

export const emptyGuide = (guide?: Partial<DemoGuide> | null): DemoGuide => ({
  goals: guide?.goals || [], has: guide?.has || [], journeys: guide?.journeys || [],
})

// The demo bar replaces the unstable tester bar while it is showing.
let barActive = false
const listeners = new Set<() => void>()
export function setDemoBarActive(active: boolean) {
  if (barActive === active) return
  barActive = active
  listeners.forEach((listener) => listener())
}
export function useDemoBarActive(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    () => barActive,
    () => false,
  )
}

const TAG_KEY = 'launchlms-demo-tag'
export function rememberDemoTag(tag: string | null) {
  try { if (tag) sessionStorage.setItem(TAG_KEY, tag); else sessionStorage.removeItem(TAG_KEY) } catch { /* storage unavailable */ }
}
export function rememberedDemoTag(): string | undefined {
  try { return sessionStorage.getItem(TAG_KEY) || undefined } catch { return undefined }
}
export const cleanDemoTag = (value: string | null) => (value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || null
