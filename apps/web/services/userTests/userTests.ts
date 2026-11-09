import { getAPIUrl } from '@services/config/config'
import { RequestBody, errorHandling } from '@services/utils/ts/requests'

/* Platform › User tests: /api/v1/user_tests. Platform admins only, except redeemLoginLink. */

export type TestCohortStatus = 'open' | 'closed' | 'expired'

export type TestCohort = {
  cohort_uuid: string
  name: string
  slug: string
  status: TestCohortStatus
  notes: string
  expires_at: string
  creation_date: string
  persona_count: number
  max_personas: number
}

export type TestPersona = {
  user_id: number
  first_name: string
  last_name: string
  username: string
  email: string
  handle: string
  brief: string
  start_state: 'has_account' | 'org_owner'
  last_active_at: string | null
  unread_mail: number
}

export type TestCohortDetail = TestCohort & { personas: TestPersona[]; org_ids: number[] }

export type TestMailLink = { url: string; path: string | null }

export type TestMail = {
  id: number
  cohort_id: number | null
  to_address: string
  to_user_id: number | null
  from_user_id: number | null
  subject: string
  reason: 'test_address' | 'persona_sender'
  captured_at: string
  opened_at: string | null
  links: TestMailLink[]
  html?: string
}

export type NewPersona = { first_name: string; last_name?: string; brief?: string; start_state?: 'has_account' | 'org_owner'; org_name?: string }

export type LoginLink = { path: string; expires_at: string }

async function call<T>(path: string, method = 'GET', body: unknown = null): Promise<T> {
  const res = await fetch(`${getAPIUrl()}user_tests/${path}`, RequestBody(method, body, null))
  return errorHandling(res)
}

export const userTestsKey = (path: string) => `${getAPIUrl()}user_tests/${path}`
export const fetchUserTests = <T,>(path: string) => call<T>(path)

export const createCohort = (body: { name: string; days?: number; notes?: string }) => call<TestCohort>('cohorts', 'POST', body)
export const closeCohort = (cohortUuid: string) => call<TestCohort>(`cohorts/${cohortUuid}/close`, 'POST')
export const addPersonas = (cohortUuid: string, personas: NewPersona[]) =>
  call<{ personas: TestPersona[] }>(`cohorts/${cohortUuid}/personas`, 'POST', { personas })
export const readTestMail = (mailId: number) => call<TestMail>(`mail/${mailId}`)
export const createLoginLink = (userId: number, targetPath = '/') =>
  call<LoginLink>(`personas/${userId}/login-link`, 'POST', { target_path: targetPath })
/** Through the web's own route, which sets this browser's cookies for the persona. */
export async function redeemLoginLink(ticket: string): Promise<{ target_path: string; persona: { user_id: number; name: string }; cohort: { name: string } }> {
  const res = await fetch('/api/user-tests/redeem', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }) })
  return errorHandling(res)
}

export function personaName(persona: Pick<TestPersona, 'first_name' | 'last_name' | 'username'>) {
  return `${persona.first_name} ${persona.last_name}`.trim() || persona.username
}

/** "First Last | brief" per line; a line starting with "owner:" also gets a test org. */
export function parsePersonaLines(text: string): NewPersona[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const owner = /^owner:\s*/i.test(line)
    const [name, ...rest] = line.replace(/^owner:\s*/i, '').split('|')
    const [first_name, ...last] = name.trim().split(/\s+/)
    return { first_name, last_name: last.join(' '), brief: rest.join('|').trim(), start_state: owner ? 'org_owner' : 'has_account' }
  })
}

/** The persona banner's cookie: "userId:name:cohort", set when a login link is redeemed. */
export function readTestPersonaCookie(cookie: string): { userId: number; name: string; cohort: string } | null {
  const raw = cookie.split('; ').find((part) => part.startsWith('launchlms_test_persona='))
  if (!raw) return null
  const [userId, name = '', cohort = ''] = raw.split('=').slice(1).join('=').replace(/^"|"$/g, '').split(':')
  const id = Number(userId)
  if (!id) return null
  const decode = (value: string) => { try { return decodeURIComponent(value) } catch { return value } }
  return { userId: id, name: decode(name), cohort: decode(cohort) }
}
