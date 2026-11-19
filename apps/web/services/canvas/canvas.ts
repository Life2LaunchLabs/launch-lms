import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader } from '@services/utils/ts/requests'

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
  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : 'That didn’t save. Try again in a moment.'
    throw new Error(detail)
  }
  return body
}

export async function getCanvasSettings(orgId: number, accessToken?: string): Promise<CanvasSettings> {
  return result(await fetch(`${getAPIUrl()}lti/orgs/${orgId}/connection`, RequestBodyWithAuthHeader('GET', null, null, accessToken)))
}

export async function saveCanvasSettings(orgId: number, body: CanvasSettingsUpdate, accessToken?: string): Promise<CanvasSettings> {
  return result(await fetch(`${getAPIUrl()}lti/orgs/${orgId}/connection`, RequestBodyWithAuthHeader('PUT', body, null, accessToken)))
}

/** A 60-second one-use ticket that signs this person in, first-party, in a tab of our own (DEV-174). */
export async function getCanvasTabTicket(orgId: number, path: string, accessToken?: string): Promise<{ ticket: string }> {
  const response = await fetch(`${getAPIUrl()}lti/tab-ticket`, RequestBodyWithAuthHeader('POST', { org_id: orgId, path }, null, accessToken))
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Couldn’t open a new tab. Try again.')
  return body
}

/** A Canvas course group's class list: students invited from it who haven't joined yet, and the last pull (DEV-193). */
export interface CanvasClassList {
  invited: Array<{ invitation_uuid: string; email: string; name: string; invited_at: string }>
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
  canvas: CanvasClassList
}

/** Update from Canvas: read the course's class list now (staff who manage learners). */
export async function pullCanvasClassList(orgId: number, groupId: number, accessToken?: string): Promise<CanvasClassListPull> {
  const response = await fetch(`${getAPIUrl()}lti/orgs/${orgId}/groups/${groupId}/class-list`, RequestBodyWithAuthHeader('POST', null, null, accessToken))
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Canvas didn’t answer. Try again in a moment.')
  return body
}
