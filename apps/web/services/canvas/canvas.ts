import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader } from '@services/utils/ts/requests'
import { refusalMessage } from '@/lib/errorDetail'

/** What the school's Canvas admin needs to add Life2Launch (API: src/services/canvas/settings.py). */
export interface CanvasToolDetails {
  config_url: string
  login_url: string
  launch_url: string
  redirect_uri: string
  jwks_url: string
}

export interface CanvasConnection {
  canvas_host: string
  client_id: string
  deployment_ids: string[]
  issuer: string
  enabled: boolean
  ages_confirmed: boolean
  ages_confirmed_at: string | null
  update_date: string
}

export interface CanvasSettings {
  connection: CanvasConnection | null
  tool: CanvasToolDetails
}

export interface CanvasSettingsUpdate {
  canvas_host: string
  client_id: string
  deployment_ids: string
  issuer?: string | null
  enabled: boolean
  ages_confirmed: boolean
}

async function result(response: Response): Promise<CanvasSettings> {
  const body = await response.json().catch(() => ({}))
  // The server's reason when it gives one; "try again" only when a retry can help (DEV-189).
  if (!response.ok) throw new Error(refusalMessage(response.status, body))
  return body
}

export async function getCanvasSettings(orgId: number, accessToken?: string): Promise<CanvasSettings> {
  return result(await fetch(`${getAPIUrl()}lti/orgs/${orgId}/connection`, RequestBodyWithAuthHeader('GET', null, null, accessToken)))
}

export async function saveCanvasSettings(orgId: number, body: CanvasSettingsUpdate, accessToken?: string): Promise<CanvasSettings> {
  let response: Response
  try {
    response = await fetch(`${getAPIUrl()}lti/orgs/${orgId}/connection`, RequestBodyWithAuthHeader('PUT', body, null, accessToken))
  } catch {
    throw new Error(refusalMessage(0, null)) // no answer at all: a retry can help
  }
  return result(response)
}

/** A 60-second one-use ticket that signs this person in, first-party, in a tab of our own (DEV-174). */
export async function getCanvasTabTicket(orgId: number, path: string, accessToken?: string): Promise<{ ticket: string }> {
  const response = await fetch(`${getAPIUrl()}lti/tab-ticket`, RequestBodyWithAuthHeader('POST', { org_id: orgId, path }, null, accessToken))
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(refusalMessage(response.status, body, 'Couldn’t open a new tab'))
  return body
}

/** A Canvas course group's class list: students invited from it who haven't joined yet, and the last pull (DEV-193). */
export interface CanvasClassList {
  /** Students (learner) and teachers (staff) on the class list who haven't joined yet. */
  invited: Array<{ invitation_uuid: string; email: string; name: string; invited_at: string; role: 'learner' | 'staff' }>
  /** The school's seats with class list invitations counted (limit 0 is unlimited; over is how many past it). */
  seats: Partial<Record<'learners' | 'staff_seats', { limit: number; used: number; over: number }>>
  /** When Life2Launch last read the class list from Canvas. */
  pulled_at: string | null
  /** Why the last pull couldn't finish, in a sentence for staff. */
  error: string | null
  /** Whether Canvas has offered this course's class list (a teacher opened Life2Launch from the course). */
  offered: boolean
  /** Whether the viewer can press Update from Canvas. */
  can_pull: boolean
}

export interface CanvasClassListPull {
  invited: number
  still_invited: number
  joined: number
  already_in: number
  withdrawn: number
  no_email: number
  removed: number
  /** Students who joined from Canvas and left the course, taken off the group (they stay in the school). */
  left: number
  canvas: CanvasClassList
}

/** Update from Canvas: read the course's class list now (staff who manage learners). */
export async function pullCanvasClassList(orgId: number, groupId: number, accessToken?: string): Promise<CanvasClassListPull> {
  const response = await fetch(`${getAPIUrl()}lti/orgs/${orgId}/groups/${groupId}/class-list`, RequestBodyWithAuthHeader('POST', null, null, accessToken))
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(refusalMessage(response.status, body, 'Couldn’t update from Canvas'))
  return body
}
