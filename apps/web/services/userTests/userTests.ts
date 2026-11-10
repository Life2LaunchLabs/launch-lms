import { getAPIUrl } from '@services/config/config'
import { RequestBody, errorHandling } from '@services/utils/ts/requests'

/* Platform › User tests: /api/v1/user_tests. Platform admins only, except redeemLoginLink. */

export type TestCohortStatus = 'open' | 'closed' | 'expired' | 'purged'

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
  start_state: 'has_account' | 'new_signup' | 'org_owner'
  last_active_at: string | null
  unread_mail: number
}

export type TestStage = { key: string; title: string; goal: string; after: { persona: string; stage: string } | null; personas?: string[] }
export type TestCohortDetail = TestCohort & { personas: TestPersona[]; org_ids: number[]; stages: TestStage[] }

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

export type NewPersona = { first_name: string; last_name?: string; brief?: string; start_state?: 'has_account' | 'new_signup' | 'org_owner'; org_name?: string }

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

export type StageStatus = 'not_started' | 'waiting' | 'in_progress' | 'done' | 'stuck'
export type BoardCell = { stage_key: string; status: StageStatus | 'not_assigned'; note: string; updated_at: string | null; waiting_on: string | null }
export type TestBoard = { stages: TestStage[]; personas: { user_id: number; name: string; handle: string; brief: string; cells: BoardCell[] }[]; counts: Record<StageStatus, number> }
export type TestEvent = { id: number; kind: 'progress' | 'finding' | 'blocked' | 'step'; persona_user_id: number | null; stage_key: string | null; payload: Record<string, string>; created_at: string }
export type NewStage = { title: string; goal?: string; after?: { persona: string; stage: string } | null; personas?: string[] }
export const setStages = (cohortUuid: string, stages: NewStage[]) => call<TestBoard>(`cohorts/${cohortUuid}/stages`, 'PUT', { stages })
export const fetchReport = (cohortUuid: string) => call<{ markdown: string }>(`cohorts/${cohortUuid}/report`)
export const setPersonaProgress = (userId: number, stageKey: string, status: StageStatus, note = '') =>
  call<BoardCell>(`personas/${userId}/progress`, 'POST', { stage_key: stageKey, status, note })

/* A persona's own session: its stages, its inbox, and what it reports. */
export type MyRun = { persona: { user_id: number; name: string; handle: string }; cohort: { name: string }; stages: (Pick<TestStage, 'key' | 'title' | 'goal'> & Pick<BoardCell, 'note' | 'waiting_on'> & { status: StageStatus })[]; unread_mail: number; others?: { user_id: number; name: string }[] }
export type NewFinding = { kind: 'bug' | 'confusion' | 'wish'; severity?: 'low' | 'medium' | 'high'; stage_key?: string | null; page?: string; what_happened: string; what_wanted?: string }
export const fetchMyRun = () => call<MyRun>('me')
/** A one-use login link for another persona of the same run. */
export const switchPersona = (userId: number) => call<{ path: string; expires_at: string }>('me/switch', 'POST', { user_id: userId })
export const fetchMyMail = () => call<{ mail: TestMail[] }>('me/mail')
export const readMyMail = (mailId: number) => call<TestMail>(`me/mail/${mailId}`)
export const reportMyProgress = (stageKey: string, status: StageStatus, note = '') => call<BoardCell>('me/progress', 'POST', { stage_key: stageKey, status, note })
export const logMyFinding = (finding: NewFinding) => call<TestEvent>('me/findings', 'POST', finding)
export type NewStep = { did: string; outcome: 'worked' | 'struggled' | 'couldnt'; wanted?: string; stage_key?: string | null; page?: string }
export const logMyStep = (step: NewStep) => call<TestEvent>('me/steps', 'POST', step)

export { parseStageLines, stageLines } from './stageLines'

export type TestLeak = { table: string; key: Record<string, number | string>; worlds: string[] }
export type TestAudit = { clean: boolean; count: number; leaks: TestLeak[]; checked_at: string }
export type TestPurge = { dry_run: boolean; counts: { personas: number; orgs: number; mail_kept: number }; audit: TestAudit; status?: 'purged' }
export const auditCohort = (cohortUuid: string) => call<TestAudit>(`cohorts/${cohortUuid}/audit`)
export const purgeCohort = (cohortUuid: string, dryRun: boolean) => call<TestPurge>(`cohorts/${cohortUuid}/purge?dry_run=${dryRun}`, 'POST')
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

/** "First Last | brief" per line; "owner:" also gets a test org, "new:" starts at sign-up onboarding. */
export function parsePersonaLines(text: string): NewPersona[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const prefix = line.match(/^(owner|new):\s*/i)
    const kind = prefix?.[1].toLowerCase()
    const [name, ...rest] = line.slice(prefix?.[0].length ?? 0).split('|')
    const [first_name, ...last] = name.trim().split(/\s+/)
    return { first_name, last_name: last.join(' '), brief: rest.join('|').trim(), start_state: kind === 'owner' ? 'org_owner' : kind === 'new' ? 'new_signup' : 'has_account' }
  })
}

/** The persona banner's cookie: "userId:name:cohort", set when a login link is redeemed. */
export { readTestPersonaCookie } from './marker'

export type TestCheckpoint = {
  id: string
  stage_key: string | null
  label: string
  automatic: boolean
  created_at: string
  records: number
  files: number
  warnings: number
  /** False once a product update makes it unpublishable. */
  current: boolean
  /** The live demo right now. */
  published: boolean
}
export const captureCheckpoint = (cohortUuid: string, stageKey: string | null = null, label = '') =>
  call<TestCheckpoint>(`cohorts/${cohortUuid}/checkpoints`, 'POST', { stage_key: stageKey, label })
export const publishCheckpoint = (checkpointId: string) =>
  call<{ demo_checkpoint_id: string; personas: number; demo_enabled: boolean }>(`checkpoints/${checkpointId}/publish`, 'POST')
/** A new cohort with fresh personas like this one's and the same stages. */
export const replayCohort = (cohortUuid: string, days = 7) => call<TestCohortDetail>(`cohorts/${cohortUuid}/replay`, 'POST', { days })
